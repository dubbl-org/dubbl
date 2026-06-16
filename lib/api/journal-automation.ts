import { db } from "@/lib/db";
import { journalEntry, journalLine, chartAccount, organization } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getExchangeRate, convertAmount, MissingExchangeRateError } from "@/lib/currency/converter";
import { convertLinesToBase, realizedSettlementLegs } from "@/lib/currency/convert-entry";
import type { SettlementRole } from "@/lib/currency/convert-entry";

interface JournalAutomationContext {
  organizationId: string;
  userId: string;
}

const RATE_SCALE = 1_000_000;

/**
 * A transaction handle, derived from db.transaction's callback parameter.
 * createPaymentJournalEntry takes one so its journal-entry/line writes commit
 * (or roll back) together with the caller's payment + document updates.
 */
type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

/** Either the pool or an open transaction — for helpers that must honor a tx. */
type DbOrTx = typeof db | Tx;

/**
 * Resolve the document -> base currency rate for posting to the GL.
 * Returns 1:1 when the document is already in the base currency. When the
 * document is in a foreign currency but no rate is available, throws
 * MissingExchangeRateError rather than silently booking at 1:1 (which would
 * put wrong numbers in the ledger) — the caller surfaces it so the user can
 * enter a custom rate.
 */
async function resolveBaseRate(
  organizationId: string,
  currencyCode: string | undefined,
  date: string
): Promise<{ base: string; currency: string; rate: number }> {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { defaultCurrency: true },
  });
  const base = org?.defaultCurrency ?? "USD";
  const currency = currencyCode ?? base;
  if (currency === base) return { base, currency, rate: RATE_SCALE };
  const rate = await getExchangeRate(organizationId, currency, base, date);
  if (rate == null) throw new MissingExchangeRateError(currency, base, date);
  return { base, currency, rate };
}

/**
 * Pre-flight guard: throw MissingExchangeRateError if a foreign-currency
 * document can't be converted to the base currency on `date`. Call this at the
 * top of a posting route — before any emails or DB writes — so a missing rate
 * fails cleanly (HTTP 422, "set a custom rate") with no side effects, rather
 * than part-way through. No-op when the document is already in the base currency.
 */
export async function assertBaseRateAvailable(
  organizationId: string,
  currencyCode: string | undefined,
  date: string
): Promise<void> {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { defaultCurrency: true },
  });
  const base = org?.defaultCurrency ?? "USD";
  const currency = currencyCode ?? base;
  if (currency === base) return;
  const rate = await getExchangeRate(organizationId, currency, base, date);
  if (rate == null) throw new MissingExchangeRateError(currency, base, date);
}

/**
 * Convert built journal lines to base currency (balance-preserving) and stamp
 * the original document currency + rate on each line.
 */
function toBaseLines(
  lines: (typeof journalLine.$inferInsert)[],
  currency: string,
  rate: number
): (typeof journalLine.$inferInsert)[] {
  const normalized = lines.map((l) => ({
    ...l,
    debitAmount: l.debitAmount ?? 0,
    creditAmount: l.creditAmount ?? 0,
  }));
  return convertLinesToBase(normalized, rate).map((l) => ({
    ...l,
    currencyCode: currency,
    exchangeRate: rate,
  }));
}

/**
 * Run rate-dependent posting work for an already-inserted entry header. If it
 * throws (e.g. MissingExchangeRateError), delete the header first so we never
 * leave an orphaned, empty "posted" entry behind, then re-throw for the caller.
 */
async function postLinesOrCleanup(
  entryId: string,
  build: () => Promise<void>
): Promise<void> {
  try {
    await build();
  } catch (err) {
    await db.delete(journalEntry).where(eq(journalEntry.id, entryId));
    throw err;
  }
}

const FX_ACCOUNTS = {
  fxGain: {
    code: "4910",
    name: "Realised Currency Gains",
    type: "revenue" as const,
    subType: "non_operating",
  },
  fxLoss: {
    code: "5930",
    name: "Realised Currency Losses",
    type: "expense" as const,
    subType: "non_operating",
  },
};

/**
 * Return the org's realised-FX gain/loss account, creating it on demand for
 * organizations whose chart predates these system accounts.
 */
async function ensureFxAccount(
  organizationId: string,
  role: "fxGain" | "fxLoss",
  baseCurrency: string,
  exec: DbOrTx = db
) {
  const def = FX_ACCOUNTS[role];
  const existing = await findAccountByCode(organizationId, def.code, exec);
  if (existing) return existing;
  // Use the caller's executor so creating this account on demand commits/rolls
  // back with the surrounding settlement transaction (no orphaned account if
  // the payment is rolled back).
  await exec
    .insert(chartAccount)
    .values({
      organizationId,
      code: def.code,
      name: def.name,
      type: def.type,
      subType: def.subType,
      currencyCode: baseCurrency,
    })
    .onConflictDoNothing({
      target: [chartAccount.organizationId, chartAccount.code],
    });
  return findAccountByCode(organizationId, def.code, exec);
}

/**
 * Find or create a system account by code/type for the given org.
 */
async function findAccountByCode(organizationId: string, code: string, exec: DbOrTx = db) {
  return exec.query.chartAccount.findFirst({
    where: and(
      eq(chartAccount.organizationId, organizationId),
      eq(chartAccount.code, code)
    ),
  });
}

/**
 * Get next entry number for an org.
 */
async function getNextEntryNumber(organizationId: string) {
  const [maxResult] = await db
    .select({ max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)` })
    .from(journalEntry)
    .where(eq(journalEntry.organizationId, organizationId));
  return (maxResult?.max || 0) + 1;
}

/**
 * Create journal entry when an invoice is sent/approved.
 * DR Accounts Receivable (asset)
 * CR Revenue (per line account)
 * CR Tax Liability (if tax)
 */
export async function createInvoiceJournalEntry(
  ctx: JournalAutomationContext,
  invoiceData: {
    invoiceNumber: string;
    total: number;
    taxTotal: number;
    subtotal: number;
    lines: { accountId: string | null; amount: number; taxAmount: number }[];
    date: string;
    currencyCode?: string;
  }
) {
  const entryNumber = await getNextEntryNumber(ctx.organizationId);

  // Find AR account
  const arAccount = await findAccountByCode(ctx.organizationId, "1200");

  if (!arAccount) return null;

  const [entry] = await db
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date: invoiceData.date,
      description: `Invoice ${invoiceData.invoiceNumber}`,
      reference: invoiceData.invoiceNumber,
      status: "posted",
      sourceType: "invoice",
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  const lines: (typeof journalLine.$inferInsert)[] = [];

  // CR Revenue accounts per line
  for (const line of invoiceData.lines) {
    if (line.accountId && line.amount > 0) {
      lines.push({
        journalEntryId: entry.id,
        accountId: line.accountId,
        description: `Invoice ${invoiceData.invoiceNumber}`,
        debitAmount: 0,
        creditAmount: line.amount,
      });
    }
  }

  // CR Tax Liability if any
  if (invoiceData.taxTotal > 0) {
    const taxAccount = await findAccountByCode(ctx.organizationId, "2200");
    if (taxAccount) {
      lines.push({
        journalEntryId: entry.id,
        accountId: taxAccount.id,
        description: `Tax on ${invoiceData.invoiceNumber}`,
        debitAmount: 0,
        creditAmount: invoiceData.taxTotal,
      });
    }
  }

  // DR Accounts Receivable for the sum of the offsetting credit legs, so the
  // entry balances in document currency even if a line lacks an account or the
  // tax account is missing — otherwise FX conversion would scale the imbalance.
  const arTotal = lines.reduce((s, l) => s + (l.creditAmount ?? 0), 0);
  if (arTotal > 0) {
    lines.unshift({
      journalEntryId: entry.id,
      accountId: arAccount.id,
      description: `Invoice ${invoiceData.invoiceNumber}`,
      debitAmount: arTotal,
      creditAmount: 0,
    });

    await postLinesOrCleanup(entry.id, async () => {
      const { currency, rate } = await resolveBaseRate(
        ctx.organizationId,
        invoiceData.currencyCode,
        invoiceData.date
      );
      await db.insert(journalLine).values(toBaseLines(lines, currency, rate));
    });
  }

  return entry;
}

/**
 * Create journal entry when a bill is received.
 * DR Expense accounts (per line)
 * DR Tax Input (if tax)
 * CR Accounts Payable (liability)
 */
export async function createBillJournalEntry(
  ctx: JournalAutomationContext,
  billData: {
    billNumber: string;
    total: number;
    taxTotal: number;
    lines: { accountId: string | null; amount: number; taxAmount: number }[];
    date: string;
    currencyCode?: string;
  }
) {
  const entryNumber = await getNextEntryNumber(ctx.organizationId);
  const apAccount = await findAccountByCode(ctx.organizationId, "2100");

  if (!apAccount) return null;

  const [entry] = await db
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date: billData.date,
      description: `Bill ${billData.billNumber}`,
      reference: billData.billNumber,
      status: "posted",
      sourceType: "bill",
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  const lines: (typeof journalLine.$inferInsert)[] = [];

  // DR Expense accounts per line
  for (const line of billData.lines) {
    if (line.accountId && line.amount > 0) {
      lines.push({
        journalEntryId: entry.id,
        accountId: line.accountId,
        description: `Bill ${billData.billNumber}`,
        debitAmount: line.amount,
        creditAmount: 0,
      });
    }
  }

  // DR Tax Input if any
  if (billData.taxTotal > 0) {
    const taxInputAccount = await findAccountByCode(ctx.organizationId, "1500");
    if (taxInputAccount) {
      lines.push({
        journalEntryId: entry.id,
        accountId: taxInputAccount.id,
        description: `Tax on ${billData.billNumber}`,
        debitAmount: billData.taxTotal,
        creditAmount: 0,
      });
    }
  }

  // CR Accounts Payable for the sum of the offsetting debit legs, so the entry
  // balances in document currency even if a line lacks an account or the tax
  // account is missing — otherwise FX conversion would scale the imbalance.
  const apTotal = lines.reduce((s, l) => s + (l.debitAmount ?? 0), 0);
  if (apTotal > 0) {
    lines.push({
      journalEntryId: entry.id,
      accountId: apAccount.id,
      description: `Bill ${billData.billNumber}`,
      debitAmount: 0,
      creditAmount: apTotal,
    });

    await postLinesOrCleanup(entry.id, async () => {
      const { currency, rate } = await resolveBaseRate(
        ctx.organizationId,
        billData.currencyCode,
        billData.date
      );
      await db.insert(journalLine).values(toBaseLines(lines, currency, rate));
    });
  }

  return entry;
}

/**
 * Create journal entry when a credit note is sent.
 * Reverses the invoice pattern:
 * DR Revenue (per line account)
 * DR Tax Liability (if tax)
 * CR Accounts Receivable
 */
export async function createCreditNoteJournalEntry(
  ctx: JournalAutomationContext,
  data: {
    creditNoteNumber: string;
    total: number;
    taxTotal: number;
    lines: { accountId: string | null; amount: number; taxAmount: number }[];
    date: string;
  }
) {
  const entryNumber = await getNextEntryNumber(ctx.organizationId);
  const arAccount = await findAccountByCode(ctx.organizationId, "1200");
  if (!arAccount) return null;

  const [entry] = await db
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date: data.date,
      description: `Credit Note ${data.creditNoteNumber}`,
      reference: data.creditNoteNumber,
      status: "posted",
      sourceType: "credit_note",
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  const lines: (typeof journalLine.$inferInsert)[] = [];

  // DR Revenue accounts (reverse of invoice CR revenue)
  for (const line of data.lines) {
    if (line.accountId && line.amount > 0) {
      lines.push({
        journalEntryId: entry.id,
        accountId: line.accountId,
        description: `Credit Note ${data.creditNoteNumber}`,
        debitAmount: line.amount,
        creditAmount: 0,
      });
    }
  }

  // DR Tax Liability (reverse of invoice CR tax)
  if (data.taxTotal > 0) {
    const taxAccount = await findAccountByCode(ctx.organizationId, "2200");
    if (taxAccount) {
      lines.push({
        journalEntryId: entry.id,
        accountId: taxAccount.id,
        description: `Tax on ${data.creditNoteNumber}`,
        debitAmount: data.taxTotal,
        creditAmount: 0,
      });
    }
  }

  // CR Accounts Receivable (reverse of invoice DR AR)
  lines.push({
    journalEntryId: entry.id,
    accountId: arAccount.id,
    description: `Credit Note ${data.creditNoteNumber}`,
    debitAmount: 0,
    creditAmount: data.total,
  });

  if (lines.length > 0) {
    await db.insert(journalLine).values(lines);
  }

  return entry;
}

/**
 * Create journal entry when a debit note is sent.
 * Reverses the bill pattern:
 * DR Accounts Payable
 * CR Expense accounts (per line)
 * CR Tax Input (if tax)
 */
export async function createDebitNoteJournalEntry(
  ctx: JournalAutomationContext,
  data: {
    debitNoteNumber: string;
    total: number;
    taxTotal: number;
    lines: { accountId: string | null; amount: number; taxAmount: number }[];
    date: string;
  }
) {
  const entryNumber = await getNextEntryNumber(ctx.organizationId);
  const apAccount = await findAccountByCode(ctx.organizationId, "2100");
  if (!apAccount) return null;

  const [entry] = await db
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date: data.date,
      description: `Debit Note ${data.debitNoteNumber}`,
      reference: data.debitNoteNumber,
      status: "posted",
      sourceType: "debit_note",
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  const lines: (typeof journalLine.$inferInsert)[] = [];

  // DR Accounts Payable (reverse of bill CR AP)
  lines.push({
    journalEntryId: entry.id,
    accountId: apAccount.id,
    description: `Debit Note ${data.debitNoteNumber}`,
    debitAmount: data.total,
    creditAmount: 0,
  });

  // CR Expense accounts (reverse of bill DR expense)
  for (const line of data.lines) {
    if (line.accountId && line.amount > 0) {
      lines.push({
        journalEntryId: entry.id,
        accountId: line.accountId,
        description: `Debit Note ${data.debitNoteNumber}`,
        debitAmount: 0,
        creditAmount: line.amount,
      });
    }
  }

  // CR Tax Input (reverse of bill DR tax)
  if (data.taxTotal > 0) {
    const taxInputAccount = await findAccountByCode(ctx.organizationId, "1500");
    if (taxInputAccount) {
      lines.push({
        journalEntryId: entry.id,
        accountId: taxInputAccount.id,
        description: `Tax on ${data.debitNoteNumber}`,
        debitAmount: 0,
        creditAmount: data.taxTotal,
      });
    }
  }

  if (lines.length > 0) {
    await db.insert(journalLine).values(lines);
  }

  return entry;
}

/**
 * Create payment journal entry.
 * For invoice payment: DR Bank, CR Accounts Receivable
 * For bill payment: DR Accounts Payable, CR Bank
 */
export async function createPaymentJournalEntry(
  ctx: JournalAutomationContext,
  paymentData: {
    type: "invoice" | "bill";
    reference: string;
    amount: number;
    date: string;
    bankAccountCode?: string;
    /**
     * The documents this payment settles, with each document's currency and
     * recognition (issue) date. When supplied and any are in a foreign
     * currency, the entry is posted in base currency with realised FX booked.
     * When omitted, the legacy single-currency 2-line entry is posted.
     */
    allocations?: { amount: number; currencyCode: string; issueDate: string }[];
  },
  // Required: the caller's open transaction, so the GL entry commits/rolls back
  // atomically with the payment, allocations, and document-status updates.
  tx: Tx
) {
  const entryNumber = await getNextEntryNumber(ctx.organizationId);
  const bankAccount = await findAccountByCode(
    ctx.organizationId,
    paymentData.bankAccountCode || "1100"
  );
  const counterAccount = await findAccountByCode(
    ctx.organizationId,
    paymentData.type === "invoice" ? "1200" : "2100"
  );

  if (!bankAccount || !counterAccount) return null;

  const [entry] = await tx
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date: paymentData.date,
      description: `Payment for ${paymentData.reference}`,
      reference: paymentData.reference,
      status: "posted",
      sourceType: "payment",
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  const isInvoice = paymentData.type === "invoice";
  const desc = `Payment for ${paymentData.reference}`;

  // Multi-currency settlement: convert to base and book realised FX. Only when
  // the allocations fully cover the payment cash — otherwise an unapplied
  // remainder (overpayment / on-account) would understate the bank, so fall
  // back to the legacy entry which posts the full cash amount.
  const allocs = paymentData.allocations ?? [];
  const allocSum = allocs.reduce((s, a) => s + a.amount, 0);
  if (allocs.length > 0 && allocSum === paymentData.amount) {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
      columns: { defaultCurrency: true },
    });
    const base = org?.defaultCurrency ?? "USD";

    let bankTotal = 0;
    let counterTotal = 0;
    for (const a of allocs) {
      const currency = a.currencyCode || base;
      if (currency === base) {
        bankTotal += a.amount;
        counterTotal += a.amount;
        continue;
      }
      // Require a rate to settle a foreign-currency document. The caller runs
      // this inside a transaction, so throwing rolls back the payment, the
      // allocations, and the document-status updates together — no orphans.
      const paymentRate = await getExchangeRate(ctx.organizationId, currency, base, paymentData.date);
      if (paymentRate == null) {
        throw new MissingExchangeRateError(currency, base, paymentData.date);
      }
      const issueRate =
        (await getExchangeRate(ctx.organizationId, currency, base, a.issueDate)) ??
        paymentRate;
      bankTotal += convertAmount(a.amount, paymentRate);
      counterTotal += convertAmount(a.amount, issueRate);
    }

    const legs = realizedSettlementLegs(paymentData.type, bankTotal, counterTotal);

    const needGain = legs.some((l) => l.role === "fxGain");
    const needLoss = legs.some((l) => l.role === "fxLoss");
    const fxGainAcct = needGain ? await ensureFxAccount(ctx.organizationId, "fxGain", base, tx) : null;
    const fxLossAcct = needLoss ? await ensureFxAccount(ctx.organizationId, "fxLoss", base, tx) : null;

    if ((needGain && !fxGainAcct) || (needLoss && !fxLossAcct)) {
      // Cannot resolve an FX account to book the realised gain/loss. Relieving
      // AR/AP at the payment-rate value would corrupt the control account, so
      // fail the entry instead. (ensureFxAccount normally creates the account,
      // making this effectively unreachable.)
      await tx.delete(journalEntry).where(eq(journalEntry.id, entry.id));
      return null;
    }

    const accountFor = (role: SettlementRole) =>
      role === "bank"
        ? bankAccount.id
        : role === "counter"
        ? counterAccount.id
        : role === "fxGain"
        ? fxGainAcct!.id
        : fxLossAcct!.id;

    await tx.insert(journalLine).values(
      legs.map((l) => ({
        journalEntryId: entry.id,
        accountId: accountFor(l.role),
        description: desc,
        debitAmount: l.debit,
        creditAmount: l.credit,
        currencyCode: base,
      }))
    );

    return entry;
  }

  // Legacy single-currency path (no allocation detail supplied).
  await tx.insert(journalLine).values([
    {
      journalEntryId: entry.id,
      accountId: isInvoice ? bankAccount.id : counterAccount.id,
      description: desc,
      debitAmount: paymentData.amount,
      creditAmount: 0,
    },
    {
      journalEntryId: entry.id,
      accountId: isInvoice ? counterAccount.id : bankAccount.id,
      description: desc,
      debitAmount: 0,
      creditAmount: paymentData.amount,
    },
  ]);

  return entry;
}

/**
 * Create journal entry for realised FX gain/loss.
 * Gain: DR Bank, CR Realised Currency Gains (4910)
 * Loss: DR Realised Currency Losses (5930), CR Bank
 *
 * NOTE: posts in the org's base currency. This requires callers to pass a
 * base-currency `amount`; wiring this into settlement also requires the GL
 * postings to convert document amounts to base (not yet done — see the
 * currency overhaul notes).
 */
export async function createFxGainLossEntry(
  ctx: JournalAutomationContext,
  data: {
    reference: string;
    amount: number; // positive = gain, negative = loss
    date: string;
    description: string;
  }
) {
  const entryNumber = await getNextEntryNumber(ctx.organizationId);

  // Realised Currency Gains "4910" (revenue), Realised Currency Losses "5930" (expense)
  const isGain = data.amount > 0;
  const fxAccount = await findAccountByCode(ctx.organizationId, isGain ? "4910" : "5930");
  const bankAccount = await findAccountByCode(ctx.organizationId, "1100");

  if (!fxAccount || !bankAccount) return null;

  const absAmount = Math.abs(data.amount);

  const [entry] = await db
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date: data.date,
      description: data.description,
      reference: data.reference,
      status: "posted",
      sourceType: "fx_gain_loss",
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  if (isGain) {
    // DR Bank, CR FX Gain
    await db.insert(journalLine).values([
      { journalEntryId: entry.id, accountId: bankAccount.id, description: data.description, debitAmount: absAmount, creditAmount: 0 },
      { journalEntryId: entry.id, accountId: fxAccount.id, description: data.description, debitAmount: 0, creditAmount: absAmount },
    ]);
  } else {
    // DR FX Loss, CR Bank
    await db.insert(journalLine).values([
      { journalEntryId: entry.id, accountId: fxAccount.id, description: data.description, debitAmount: absAmount, creditAmount: 0 },
      { journalEntryId: entry.id, accountId: bankAccount.id, description: data.description, debitAmount: 0, creditAmount: absAmount },
    ]);
  }

  return entry;
}

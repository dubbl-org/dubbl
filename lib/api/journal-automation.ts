import { db } from "@/lib/db";
import { journalEntry, journalLine, organization, taxRate, taxComponent, inventoryItem, inventoryMovement, bankAccount as bankAccountTable } from "@/lib/db/schema";
import { eq, and, inArray, sql, isNull } from "drizzle-orm";
import { recordInventoryReceipt, recordInventoryIssue, type ValuedItem } from "./inventory-valuation";
import { getExchangeRate, convertAmount, MissingExchangeRateError } from "@/lib/currency/converter";
import { convertLinesToBase, realizedSettlementLegs } from "@/lib/currency/convert-entry";
import type { SettlementRole } from "@/lib/currency/convert-entry";
import { ensureAccountForCode, findAccountForCode } from "./account-roles";
import { resolveBillPostingLines, journalImbalance } from "./bill-lines";
import { ensureBankLedgerAccount } from "./bank-ledger";
import { emitJournalPosted } from "@/lib/webhooks/events";
import { splitCompoundTax, type CompoundPart } from "@/lib/tax/compound";

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
export async function resolveBaseRate(
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
export function toBaseLines(
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
 *
 * Pass the surrounding `exec` so the cleanup delete runs in the SAME executor
 * that inserted the header. When the caller is inside a db.transaction the whole
 * thing rolls back anyway, but using the tx avoids a deadlock (the pool delete
 * would block on the uncommitted row) and keeps the no-op-on-rollback contract.
 */
async function postLinesOrCleanup(
  entryId: string,
  build: () => Promise<void>,
  exec: DbOrTx = db
): Promise<void> {
  try {
    await build();
  } catch (err) {
    await exec.delete(journalEntry).where(eq(journalEntry.id, entryId));
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
  // Use the caller's executor so creating this account on demand commits/rolls
  // back with the surrounding settlement transaction (no orphaned account if
  // the payment is rolled back).
  return ensureAccountForCode(organizationId, FX_ACCOUNTS[role], baseCurrency, exec);
}

/**
 * Find the org's account for a code. Canonical generic codes ("1200", "2200"…)
 * resolve to whichever account plays that role in the org's chart — e.g. 610
 * Accounts Receivable in a Xero-style chart (see account-roles.ts); any other
 * code is matched literally.
 */
export async function findAccountByCode(organizationId: string, code: string, exec: DbOrTx = db) {
  return findAccountForCode(organizationId, code, exec);
}

/** System control/settlement accounts used by tax-aware and inventory postings. */
const CONTROL_ACCOUNTS = {
  inputVat: { code: "1500", name: "Input VAT / GST Receivable", type: "asset" as const, subType: "input_vat" },
  outputVat: { code: "2200", name: "Output VAT / GST Payable", type: "liability" as const, subType: "output_vat" },
  salesTaxPayable: { code: "2230", name: "Sales Tax Payable", type: "liability" as const, subType: "current" },
  supplierVatReceivable: { code: "1510", name: "VAT Recoverable from Supplier", type: "asset" as const, subType: "current" },
  vatSuspense: { code: "2240", name: "VAT Suspense / Return Clearing", type: "liability" as const, subType: "current" },
  vatReceivableAuthority: { code: "1270", name: "VAT Receivable from Authority", type: "asset" as const, subType: "current" },
  inventory: { code: "1300", name: "Inventory", type: "asset" as const, subType: "current" },
  cogs: { code: "5000", name: "Cost of Goods Sold", type: "expense" as const, subType: "cogs" },
  grni: { code: "2150", name: "Goods Received Not Invoiced", type: "liability" as const, subType: "current" },
  inventoryShrinkage: { code: "5010", name: "Inventory Shrinkage", type: "expense" as const, subType: "cogs" },
  inventoryWriteDown: { code: "5020", name: "Inventory Write-Down", type: "expense" as const, subType: "cogs" },
  purchasePriceVariance: { code: "5050", name: "Purchase Price Variance", type: "expense" as const, subType: "cogs" },
  customerDeposits: { code: "2410", name: "Customer Deposits", type: "liability" as const, subType: "current" },
  undepositedFunds: { code: "1250", name: "Undeposited Funds", type: "asset" as const, subType: "current" },
};

/**
 * Find (or create on demand) a system control account by code, so tax-aware
 * postings work even for organizations whose chart predates these accounts.
 */
export async function ensureControlAccount(
  organizationId: string,
  key: keyof typeof CONTROL_ACCOUNTS,
  baseCurrency: string,
  exec: DbOrTx = db
) {
  return ensureAccountForCode(organizationId, CONTROL_ACCOUNTS[key], baseCurrency, exec);
}

/**
 * Find (or create on demand) ANY GL account by code for an org — the generic
 * version of ensureControlAccount for callers that need an account not in the
 * CONTROL_ACCOUNTS map (payroll liabilities, allowance accounts, revaluation
 * surplus, CWIP, etc.). Lets feature modules post to a stable code without
 * threading every account through the control map.
 */
export async function ensureAccountByCode(
  organizationId: string,
  def: { code: string; name: string; type: "asset" | "liability" | "equity" | "revenue" | "expense"; subType?: string },
  baseCurrency: string,
  exec: DbOrTx = db
) {
  return ensureAccountForCode(organizationId, def, baseCurrency, exec);
}

/**
 * Split a TAX-INCLUSIVE gross amount into net, recoverable tax, and absorbed
 * (irrecoverable) tax — the core "tax you shouldn't have to pay" rule:
 *   • recoverableTax → reclaimable input-VAT control account
 *   • absorbedTax    → folded into the expense/asset cost (blocked/partial)
 * Always residual-balanced so net + recoverableTax + absorbedTax === gross.
 *
 * @param gross tax-inclusive amount in cents
 * @param rateBp tax rate in basis points (2000 = 20%)
 * @param recoverableBp share of the tax that is recoverable, in basis points
 *   (10000 = 100%, 5000 = 50%, 0 = fully blocked)
 */
export function splitGrossTax(
  gross: number,
  rateBp: number,
  recoverableBp: number
): { net: number; tax: number; recoverableTax: number; absorbedTax: number } {
  if (rateBp <= 0) return { net: gross, tax: 0, recoverableTax: 0, absorbedTax: 0 };
  const tax = Math.round((gross * rateBp) / (10000 + rateBp));
  const recoverableTax = Math.round((tax * recoverableBp) / 10000);
  const absorbedTax = tax - recoverableTax;
  const net = gross - tax; // residual keeps the entry balanced to the cent
  return { net, tax, recoverableTax, absorbedTax };
}

/**
 * Get next entry number for an org. Pass the surrounding `tx` when posting more
 * than one entry inside a single db.transaction — otherwise the read hits the
 * pool (not the uncommitted tx) and every entry in the tx gets the SAME number,
 * violating the (organizationId, entryNumber) unique index.
 *
 * Every posting path takes its number here, so this is also where the
 * `journal.posted` webhook is queued: after the request it fires for the entry
 * that got this number, only if it committed with status "posted".
 */
export async function getNextEntryNumber(
  organizationId: string,
  exec: DbOrTx = db
) {
  const [maxResult] = await exec
    .select({ max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)` })
    .from(journalEntry)
    .where(eq(journalEntry.organizationId, organizationId));
  const entryNumber = (maxResult?.max || 0) + 1;
  emitJournalPosted(organizationId, { entryNumber });
  return entryNumber;
}

/**
 * Post a true REVERSING entry for an already-posted journal entry: a new posted
 * entry whose lines mirror the original with debit/credit swapped. Both entries
 * stay `posted` so reports (which count posted only) net the pair to zero, and
 * the audit trail is preserved — unlike flipping the original to `void`, which
 * makes the amount silently vanish from every report (even closed periods) with
 * no offsetting record.
 *
 * Links the pair via reversesEntryId / reversedByEntryId. Returns the reversal
 * entry, or null when the original has no lines (nothing to reverse).
 *
 * The caller is responsible for the period-lock check (assertNotLocked on the
 * reversal date) and for running this inside a db.transaction so the reversal
 * commits/rolls back with the document status change.
 */
export async function reverseJournalEntry(
  ctx: JournalAutomationContext,
  data: {
    entryId: string;
    date: string;
    description: string;
    reference?: string | null;
    sourceType: string;
    sourceId?: string | null;
  },
  tx: Tx
): Promise<typeof journalEntry.$inferSelect | null> {
  const originalLines = await tx.query.journalLine.findMany({
    where: eq(journalLine.journalEntryId, data.entryId),
  });
  if (originalLines.length === 0) return null;

  const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
  const [reversal] = await tx
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date: data.date,
      description: data.description,
      reference: data.reference ?? null,
      status: "posted",
      sourceType: data.sourceType,
      sourceId: data.sourceId ?? null,
      reversesEntryId: data.entryId,
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  await tx.insert(journalLine).values(
    originalLines.map((l) => ({
      journalEntryId: reversal.id,
      accountId: l.accountId,
      description: data.description,
      debitAmount: l.creditAmount,
      creditAmount: l.debitAmount,
      currencyCode: l.currencyCode,
      exchangeRate: l.exchangeRate,
      costCenterId: l.costCenterId,
      projectId: l.projectId,
    }))
  );

  // Link the original back to its reversal so the UI can show "Reversed" and
  // never offers to reverse it twice.
  await tx
    .update(journalEntry)
    .set({ reversedByEntryId: reversal.id, updatedAt: new Date() })
    .where(eq(journalEntry.id, data.entryId));

  return reversal;
}

/**
 * Compound tax rates (e.g. GST + PST) whose parts post to their own ledger
 * accounts. Splits each line's tax between the rate's parts by part rate
 * (lib/tax/compound) and returns what goes to each part account. Tax on parts
 * without an account, and on lines without a compound rate, is left for the
 * caller's default tax account (`total` is what was routed away from it).
 */
async function compoundTaxRouting(
  lines: { taxRateId?: string | null; taxAmount: number }[],
  exec: DbOrTx = db
): Promise<{ byAccount: Map<string, number>; total: number }> {
  const byAccount = new Map<string, number>();
  const ids = [...new Set(lines.map((l) => l.taxRateId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return { byAccount, total: 0 };
  const parts = await exec
    .select({ taxRateId: taxComponent.taxRateId, rate: taxComponent.rate, accountId: taxComponent.accountId })
    .from(taxComponent)
    .where(inArray(taxComponent.taxRateId, ids));
  const partsByRate = new Map<string, CompoundPart[]>();
  for (const p of parts) {
    partsByRate.set(p.taxRateId, [...(partsByRate.get(p.taxRateId) ?? []), { rate: p.rate, accountId: p.accountId }]);
  }
  let total = 0;
  for (const line of lines) {
    const ratePart = line.taxRateId ? partsByRate.get(line.taxRateId) : undefined;
    if (!ratePart || !ratePart.some((p) => p.accountId) || !line.taxAmount) continue;
    for (const split of splitCompoundTax(line.taxAmount, ratePart)) {
      if (!split.accountId || split.amount === 0) continue;
      byAccount.set(split.accountId, (byAccount.get(split.accountId) ?? 0) + split.amount);
      total += split.amount;
    }
  }
  return { byAccount, total };
}

/**
 * Does tax collected on sales go to Sales Tax Payable (2230) rather than
 * Output VAT (2200)? Yes for US sales tax: an organization on the US sales tax
 * regime (or in the US with no regime set), or any rate of kind sales_tax_us.
 * Pure, so it is unit tested.
 */
export function isUsSalesTax(org: { taxRegime?: string | null; countryCode?: string | null } | null | undefined, rateKind?: string | null): boolean {
  if (rateKind === "sales_tax_us") return true;
  if (!org) return false;
  if (org.taxRegime) return org.taxRegime === "us_sales_tax";
  return (org.countryCode ?? "").toUpperCase() === "US";
}

/** isUsSalesTax for an organization by id (no rate kind). */
export async function orgIsUsSalesTax(organizationId: string, exec: DbOrTx = db): Promise<boolean> {
  const org = await exec.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { taxRegime: true, countryCode: true },
  });
  return isUsSalesTax(org);
}

/**
 * Where the tax collected on a sales document posts. Compound-rate parts with
 * their own account go there; US sales tax goes to Sales Tax Payable (2230);
 * everything else to Output VAT / GST Payable (2200). `taxTotal` is the
 * document's tax; any tax not carried on a line (legacy callers) goes to the
 * default account. Returns positive amounts per account, integer cents.
 */
export async function routeOutputTax(
  organizationId: string,
  lines: { taxRateId?: string | null; taxAmount: number }[],
  taxTotal: number,
  exec: DbOrTx = db
): Promise<{ accountId: string; amount: number }[]> {
  if (taxTotal <= 0) return [];
  const routed = await compoundTaxRouting(lines, exec);
  const org = await exec.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { defaultCurrency: true, taxRegime: true, countryCode: true },
  });
  const base = org?.defaultCurrency ?? "USD";
  const usOrg = isUsSalesTax(org);

  // Lines on a sales_tax_us rate post to 2230 even in a non-US org; compound
  // rates with part accounts were routed above.
  let usTax = 0;
  if (!usOrg) {
    const ids = [...new Set(lines.map((l) => l.taxRateId).filter((id): id is string => Boolean(id)))];
    if (ids.length > 0) {
      const kinds = await exec
        .select({ id: taxRate.id, kind: taxRate.kind })
        .from(taxRate)
        .where(inArray(taxRate.id, ids));
      const compoundIds = new Set(
        (await exec.select({ id: taxComponent.taxRateId }).from(taxComponent).where(and(inArray(taxComponent.taxRateId, ids), sql`${taxComponent.accountId} is not null`))).map((r) => r.id)
      );
      const usRates = new Set(kinds.filter((k) => k.kind === "sales_tax_us" && !compoundIds.has(k.id)).map((k) => k.id));
      usTax = lines.reduce((sum, l) => sum + (l.taxRateId && usRates.has(l.taxRateId) ? l.taxAmount : 0), 0);
    }
  }

  const out: { accountId: string; amount: number }[] = [];
  for (const [accountId, amount] of routed.byAccount) if (amount > 0) out.push({ accountId, amount });
  const rest = taxTotal - routed.total;
  const toSalesTax = usOrg ? rest : Math.min(Math.max(usTax, 0), rest);
  const toOutputVat = rest - toSalesTax;
  if (toSalesTax > 0) {
    const a = await ensureControlAccount(organizationId, "salesTaxPayable", base, exec);
    if (a) out.push({ accountId: a.id, amount: toSalesTax });
  }
  if (toOutputVat > 0) {
    const a = await ensureControlAccount(organizationId, "outputVat", base, exec);
    if (a) out.push({ accountId: a.id, amount: toOutputVat });
  }
  return out;
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
    // taxRateId (optional): a compound rate's parts with their own account get
    // their share of the line's tax; everything else goes to Output VAT 2200.
    lines: { accountId: string | null; amount: number; taxAmount: number; taxRateId?: string | null }[];
    date: string;
    currencyCode?: string;
  },
  // Optional surrounding transaction. When supplied, the header + lines are
  // written through it so recognition + COGS + the document status/journalEntryId
  // update commit (or roll back) atomically; defaults to the pool (legacy).
  exec: DbOrTx = db
) {
  const entryNumber = await getNextEntryNumber(ctx.organizationId, exec);

  // Find AR account
  const arAccount = await findAccountByCode(ctx.organizationId, "1200", exec);

  if (!arAccount) return null;

  const [entry] = await exec
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

  // CR Tax Liability if any: compound-rate parts with their own account,
  // US sales tax to Sales Tax Payable 2230, the rest to Output VAT 2200.
  for (const t of await routeOutputTax(ctx.organizationId, invoiceData.lines, invoiceData.taxTotal, exec)) {
    lines.push({
      journalEntryId: entry.id,
      accountId: t.accountId,
      description: `Tax on ${invoiceData.invoiceNumber}`,
      debitAmount: 0,
      creditAmount: t.amount,
    });
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

    await postLinesOrCleanup(
      entry.id,
      async () => {
        const { currency, rate } = await resolveBaseRate(
          ctx.organizationId,
          invoiceData.currencyCode,
          invoiceData.date
        );
        await exec.insert(journalLine).values(toBaseLines(lines, currency, rate));
      },
      exec
    );
  }

  return entry;
}

/**
 * Create journal entry when a bill is received.
 * DR Expense accounts (per line)
 * DR Tax Input (recoverable portion only — see below)
 * CR Accounts Payable (liability)
 *
 * Input-tax handling ("don't pay tax you shouldn't"):
 *   • Legacy / no per-line taxRateId: the whole `taxTotal` is debited to Input
 *     VAT 1500 (the historical behaviour, fully backward compatible).
 *   • When a line carries an OPTIONAL `taxRateId`, its ALREADY-KNOWN per-line
 *     tax (`line.taxAmount`) is split by the rate's `recoverablePercent`: the
 *     recoverable slice → Input VAT 1500, the blocked/partial slice → ABSORBED
 *     into that line's expense/cost account. (The net line amount is NOT treated
 *     as a tax-inclusive gross.)
 *   • reverse_charge lines self-account both VAT boxes off the NET at the rate:
 *     CR Output VAT 2200 = round(net × rate / 10000), DR Input VAT 1500 =
 *     round(that × recoverablePercent / 10000) — net-zero cash; the supplier is
 *     paid net only (the output VAT is NOT included in AP's slice).
 *
 * The AP credit leg is always derived from the sum of posted debits minus the
 * reverse-charge output-VAT credits, so the entry balances to the cent in both
 * single- and foreign-currency cases (verified via toBaseLines).
 */
export async function createBillJournalEntry(
  ctx: JournalAutomationContext,
  billData: {
    billNumber: string;
    total: number;
    taxTotal: number;
    lines: {
      accountId: string | null;
      amount: number;
      taxAmount: number;
      // Optional per-line tax rate. When supplied, the line's tax is split by
      // the rate's recoverablePercent (recoverable → 1500, blocked → cost) and
      // reverse_charge lines self-account output VAT. Omit for legacy behaviour.
      taxRateId?: string | null;
    }[];
    date: string;
    currencyCode?: string;
  }
) {
  // Base currency, for any control accounts we create on demand below.
  const { base } = await resolveBaseRate(
    ctx.organizationId,
    billData.currencyCode,
    billData.date
  );

  // Accounts Payable is created on demand like the other control accounts, so
  // a chart without it can't leave a bill "in your books" with no entry.
  const apAccount = await ensureAccountByCode(
    ctx.organizationId,
    { code: "2100", name: "Accounts Payable - Trade", type: "liability", subType: "current" },
    base
  );
  if (!apAccount) return null;

  // Every non-zero line posts somewhere. A line with no account (none picked,
  // no supplier default, not a stock line) goes to Miscellaneous Expense, so
  // the cost isn't dropped while AP is credited for the whole bill.
  const needsFallback = billData.lines.some((l) => !l.accountId && l.amount !== 0);
  const fallbackAccountId = needsFallback
    ? (
        await ensureAccountByCode(
          ctx.organizationId,
          { code: "5990", name: "Miscellaneous Expense", type: "expense", subType: "operating" },
          base
        )
      )?.id ?? null
    : null;
  const postingLines = resolveBillPostingLines(billData.lines, fallbackAccountId);

  const entryNumber = await getNextEntryNumber(ctx.organizationId);

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

  // Tax handled per-line via an explicit taxRateId (recoverable→1500,
  // blocked→cost, reverse_charge→dual legs); whatever isn't handled per-line
  // is summed and posted in bulk to 1500 below (legacy behaviour).
  let recoverableToInputVat = 0; // accumulates per-line recoverable slices
  let reverseChargeOutputVat = 0; // accumulates self-accounted output VAT
  let perLineTaxHandled = 0; // sum of taxAmount handled on a per-line basis
  const routedInputTax = new Map<string, number>(); // compound-rate parts with their own account

  // Lazily resolved control accounts (only created when actually needed).
  let inputVatAccountId: string | null = null;
  let outputVatAccountId: string | null = null;
  const getInputVat = async () => {
    if (inputVatAccountId) return inputVatAccountId;
    const a = await ensureControlAccount(ctx.organizationId, "inputVat", base);
    inputVatAccountId = a?.id ?? null;
    return inputVatAccountId;
  };
  const getOutputVat = async () => {
    if (outputVatAccountId) return outputVatAccountId;
    const a = await ensureControlAccount(ctx.organizationId, "outputVat", base);
    outputVatAccountId = a?.id ?? null;
    return outputVatAccountId;
  };

  // DR Expense accounts per line (absorbing any blocked input tax into cost).
  // Track the first posted expense line so the legacy remainder path (below) can
  // fold any irrecoverable slice of leftover tax back into a real cost line.
  let firstExpenseLineIndex: number | null = null;
  for (const line of postingLines) {
    // A negative line (a discount or credit on the bill) reduces its account.
    if (line.amount < 0) {
      lines.push({
        journalEntryId: entry.id,
        accountId: line.accountId,
        description: `Bill ${billData.billNumber}`,
        debitAmount: 0,
        creditAmount: -line.amount,
      });
      continue;
    }

    let expenseDebit = line.amount;

    if (line.taxRateId) {
      const rateRow = await db.query.taxRate.findFirst({
        where: eq(taxRate.id, line.taxRateId),
        columns: { rate: true, kind: true, recoverablePercent: true },
      });
      if (rateRow) {
        if (rateRow.kind === "reverse_charge" && rateRow.rate > 0) {
          // Reverse charge: the supplier charged no VAT, so line.amount IS the
          // net (and line.taxAmount is typically 0). The buyer self-accounts
          // notional VAT in BOTH boxes computed off the NET at the rate (bp):
          //   output VAT (CR 2200) = round(net * rate / 10000)
          //   input  VAT (DR 1500) = round(outputVat * recoverablePercent / 10000)
          // Net-zero cash: only net (+ any blocked slice) hits AP; the output
          // VAT credit reduces the derived AP leg.
          const outputVat = Math.round((line.amount * rateRow.rate) / 10000);
          const recoverableTax = Math.round(
            (outputVat * rateRow.recoverablePercent) / 10000
          );
          const absorbedTax = outputVat - recoverableTax;
          recoverableToInputVat += recoverableTax;
          expenseDebit += absorbedTax;
          reverseChargeOutputVat += outputVat;
          perLineTaxHandled += line.taxAmount;
        } else if (line.taxAmount > 0) {
          // Standard/blocked/partial: the per-line tax is ALREADY known as
          // line.taxAmount — split it directly by recoverablePercent. The
          // recoverable slice is posted to Input VAT 1500; the blocked slice is
          // absorbed into this line's expense/cost debit. (Do NOT treat the net
          // line amount as a tax-inclusive gross.)
          const recoverableTax = Math.round(
            (line.taxAmount * rateRow.recoverablePercent) / 10000
          );
          const absorbedTax = line.taxAmount - recoverableTax;
          // Compound rate: parts with their own account take their share of
          // the recoverable tax; the rest goes to Input VAT 1500.
          const routed = await compoundTaxRouting([{ taxRateId: line.taxRateId, taxAmount: recoverableTax }]);
          for (const [accountId, amount] of routed.byAccount) {
            routedInputTax.set(accountId, (routedInputTax.get(accountId) ?? 0) + amount);
          }
          recoverableToInputVat += recoverableTax - routed.total;
          expenseDebit += absorbedTax;
          perLineTaxHandled += line.taxAmount;
        }
      }
    }

    if (firstExpenseLineIndex === null) firstExpenseLineIndex = lines.length;
    lines.push({
      journalEntryId: entry.id,
      accountId: line.accountId,
      description: `Bill ${billData.billNumber}`,
      debitAmount: expenseDebit,
      creditAmount: 0,
    });
  }

  // DR Input VAT for any tax NOT handled per-line (legacy: whole remainder to
  // 1500) PLUS the recoverable slices accumulated from per-line taxRateIds.
  //
  // The legacy remainder (tax on lines that carry no taxRateId) used to post in
  // full to Input VAT 1500 with no recoverability split, which over-reclaims for
  // non-recoverable / partial / reverse-charge supplies. If a recoverability can
  // be determined for the remainder — via the org's default tax rate — split it
  // like the per-line path: the recoverable slice → 1500, the blocked slice is
  // absorbed into a real cost line (the first posted expense line). The total
  // posted debits are unchanged (the absorbed slice just moves from 1500 to the
  // expense line), so the entry stays balanced to the cent.
  let legacyTaxRemainder = Math.max(0, billData.taxTotal - perLineTaxHandled);
  if (legacyTaxRemainder > 0 && firstExpenseLineIndex !== null) {
    const defaultRate = await db.query.taxRate.findFirst({
      where: and(
        eq(taxRate.organizationId, ctx.organizationId),
        eq(taxRate.isDefault, true),
        isNull(taxRate.deletedAt)
      ),
      columns: { kind: true, recoverablePercent: true },
    });
    // Only adjust when the determinable default rate is actually less than fully
    // recoverable; a 100%-recoverable standard rate matches the legacy behaviour
    // (whole remainder to 1500), so there is nothing to absorb.
    if (
      defaultRate &&
      defaultRate.kind !== "reverse_charge" &&
      defaultRate.recoverablePercent < 10000
    ) {
      const recoverableRemainder = Math.round(
        (legacyTaxRemainder * defaultRate.recoverablePercent) / 10000
      );
      const absorbedRemainder = legacyTaxRemainder - recoverableRemainder;
      const expenseLine = lines[firstExpenseLineIndex];
      expenseLine.debitAmount = (expenseLine.debitAmount ?? 0) + absorbedRemainder;
      recoverableToInputVat += recoverableRemainder;
      legacyTaxRemainder = 0; // fully accounted: recoverable slice + absorbed slice
    }
    // If no default rate is determinable (or it is fully recoverable), fall
    // through with the remainder intact — keeping the legacy whole-remainder-to
    // -1500 behaviour rather than guessing recoverability we cannot establish.
  }
  const inputVatDebit = legacyTaxRemainder + recoverableToInputVat;
  if (inputVatDebit > 0) {
    // Always ensure-on-demand the Input VAT control account (1500). Previously
    // the legacy remainder path looked up 1500 with findAccountByCode and, when
    // an org's chart predated 1500, silently DROPPED this debit leg — leaving an
    // unbalanced AP credit (or, if it was the only leg, an empty "posted"
    // header). ensureControlAccount creates 1500 on demand so the input-tax leg
    // always posts and the entry balances.
    const taxInputAccountId = await getInputVat();
    if (taxInputAccountId) {
      lines.push({
        journalEntryId: entry.id,
        accountId: taxInputAccountId,
        description: `Tax on ${billData.billNumber}`,
        debitAmount: inputVatDebit,
        creditAmount: 0,
      });
    }
  }

  // DR the compound-rate parts that post to their own account.
  for (const [accountId, amount] of routedInputTax) {
    if (amount <= 0) continue;
    lines.push({
      journalEntryId: entry.id,
      accountId,
      description: `Tax on ${billData.billNumber}`,
      debitAmount: amount,
      creditAmount: 0,
    });
  }

  // CR Output VAT for reverse-charge self-accounting (net-zero cash leg).
  if (reverseChargeOutputVat > 0) {
    const outId = await getOutputVat();
    if (outId) {
      lines.push({
        journalEntryId: entry.id,
        accountId: outId,
        description: `Reverse-charge VAT on ${billData.billNumber}`,
        debitAmount: 0,
        creditAmount: reverseChargeOutputVat,
      });
    }
  }

  // CR Accounts Payable for the debit legs LESS every credit leg posted above
  // (reverse-charge output VAT, negative lines), so the entry balances in
  // document currency (otherwise FX conversion would scale an imbalance).
  // Reverse charge is paid net, so its self-accounted output VAT must not
  // inflate AP. Every non-zero line posts (see resolveBillPostingLines), so AP
  // equals what the bill says is owed.
  const apTotal = journalImbalance(lines);
  if (apTotal <= 0) {
    // Nothing owed (an all-zero bill): don't leave an empty posted header.
    await db.delete(journalEntry).where(eq(journalEntry.id, entry.id));
    if (apTotal < 0) throw new Error(`Bill ${billData.billNumber} credits more than it charges, so it can't be posted as a bill.`);
    return null;
  }
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
    // taxRateId (optional): see createInvoiceJournalEntry.
    lines: { accountId: string | null; amount: number; taxAmount: number; taxRateId?: string | null }[];
    date: string;
    currencyCode?: string;
  },
  // Optional surrounding transaction. When supplied, the header + lines are
  // written through it so the reversal + COGS restock + the document
  // status/journalEntryId update commit (or roll back) atomically; defaults to
  // the pool (legacy).
  exec: DbOrTx = db
) {
  const entryNumber = await getNextEntryNumber(ctx.organizationId, exec);
  const arAccount = await findAccountByCode(ctx.organizationId, "1200", exec);
  if (!arAccount) return null;

  const [entry] = await exec
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

  // DR Tax Liability (reverse of invoice CR tax), routed the same way as the
  // invoice (compound parts, US sales tax 2230, else Output VAT 2200).
  for (const t of await routeOutputTax(ctx.organizationId, data.lines, data.taxTotal, exec)) {
    lines.push({
      journalEntryId: entry.id,
      accountId: t.accountId,
      description: `Tax on ${data.creditNoteNumber}`,
      debitAmount: t.amount,
      creditAmount: 0,
    });
  }

  // CR Accounts Receivable for the sum of the offsetting debit legs (revenue +
  // tax actually posted), so the entry balances in document currency even if a
  // line lacks an account or the tax account is missing — otherwise FX
  // conversion would scale the imbalance. (Mirror of the invoice fix.)
  const arTotal = lines.reduce((s, l) => s + (l.debitAmount ?? 0), 0);
  if (arTotal > 0) {
    lines.push({
      journalEntryId: entry.id,
      accountId: arAccount.id,
      description: `Credit Note ${data.creditNoteNumber}`,
      debitAmount: 0,
      creditAmount: arTotal,
    });

    await postLinesOrCleanup(
      entry.id,
      async () => {
        const { currency, rate } = await resolveBaseRate(
          ctx.organizationId,
          data.currencyCode,
          data.date
        );
        await exec.insert(journalLine).values(toBaseLines(lines, currency, rate));
      },
      exec
    );
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
    // taxRateId (optional): a compound rate's parts with their own account
    // get their share of the line's tax; the rest reverses Input VAT 1500.
    lines: { accountId: string | null; amount: number; taxAmount: number; taxRateId?: string | null }[];
    date: string;
    // Optional document currency. When supplied (and foreign), the entry is
    // posted in base currency; defaults to the org base currency.
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

  // CR Tax Input (reverse of bill DR tax), compound-rate parts with their own
  // account first.
  if (data.taxTotal > 0) {
    const routed = await compoundTaxRouting(data.lines);
    for (const [accountId, amount] of routed.byAccount) {
      if (amount <= 0) continue;
      lines.push({
        journalEntryId: entry.id,
        accountId,
        description: `Tax on ${data.debitNoteNumber}`,
        debitAmount: 0,
        creditAmount: amount,
      });
    }
    const taxInputAccount = await findAccountByCode(ctx.organizationId, "1500");
    const rest = data.taxTotal - routed.total;
    if (taxInputAccount && rest > 0) {
      lines.push({
        journalEntryId: entry.id,
        accountId: taxInputAccount.id,
        description: `Tax on ${data.debitNoteNumber}`,
        debitAmount: 0,
        creditAmount: rest,
      });
    }
  }

  // DR Accounts Payable for the sum of the offsetting credit legs (expense + tax
  // actually posted), so the entry balances in document currency even if a line
  // lacks an account or the tax account is missing — otherwise FX conversion
  // would scale the imbalance. (Mirror of the bill fix.)
  const apTotal = lines.reduce((s, l) => s + (l.creditAmount ?? 0), 0);
  if (apTotal > 0) {
    lines.unshift({
      journalEntryId: entry.id,
      accountId: apAccount.id,
      description: `Debit Note ${data.debitNoteNumber}`,
      debitAmount: apTotal,
      creditAmount: 0,
    });

    await postLinesOrCleanup(entry.id, async () => {
      const { currency, rate } = await resolveBaseRate(
        ctx.organizationId,
        data.currencyCode,
        data.date
      );
      await db.insert(journalLine).values(toBaseLines(lines, currency, rate));
    });
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
     * The bank account (bank_account row, not a chart account) the money moved
     * through. When set, the cash leg posts to that account's own ledger
     * account so each bank account reconciles on its own; otherwise it falls
     * back to bankAccountCode / the main bank account.
     */
    bankAccountId?: string | null;
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
  const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
  // Prefer the ledger account linked to the actual bank account (linking or
  // creating one on demand, as the bank feed does); fall back to the code.
  let bankAccount: { id: string } | null = null;
  if (paymentData.bankAccountId) {
    const bankRow = await tx.query.bankAccount.findFirst({
      where: and(
        eq(bankAccountTable.id, paymentData.bankAccountId),
        eq(bankAccountTable.organizationId, ctx.organizationId),
        isNull(bankAccountTable.deletedAt)
      ),
      columns: {
        id: true,
        accountName: true,
        accountType: true,
        currencyCode: true,
        chartAccountId: true,
      },
    });
    if (bankRow) {
      bankAccount = { id: await ensureBankLedgerAccount(ctx.organizationId, bankRow, tx) };
    }
  }
  if (!bankAccount) {
    bankAccount = (await findAccountByCode(
      ctx.organizationId,
      paymentData.bankAccountCode || "1100"
    )) ?? null;
  }
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
 * Post a bank transaction directly to a chosen ledger account ("categorize").
 *
 * This is the generic money-in / money-out coding primitive behind the bank
 * feed's Categorize action. The "type" of coding (expense, income, loan
 * received, owner contribution, transfer, owner drawings, ...) is simply which
 * account the user picks for the OTHER side — the double entry follows from the
 * sign of the bank amount:
 *   money in  (amount > 0): DR bank GL,  CR chosen account
 *   money out (amount < 0): DR chosen account, CR bank GL
 *
 * Posts in base currency (balance-preserving) when the transaction is in a
 * foreign currency, throwing MissingExchangeRateError if no rate is available —
 * the caller surfaces that so the user can enter a rate.
 */
export async function createCategorizationJournalEntry(
  ctx: JournalAutomationContext,
  data: {
    bankGlAccountId: string;
    otherAccountId: string;
    amount: number; // signed, transaction-currency cents (>0 in, <0 out)
    date: string;
    reference: string;
    description: string;
    currencyCode?: string;
    /** Optional tax rate to split the (tax-inclusive) amount into net + tax. */
    taxRateId?: string | null;
    /** Optional tracking applied to the categorized (non-bank, non-tax) line. */
    costCenterId?: string | null;
    projectId?: string | null;
  },
  tx: Tx
) {
  const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
  const abs = Math.abs(data.amount);
  if (abs === 0) return null;
  const moneyIn = data.amount > 0;

  const { base, currency, rate } = await resolveBaseRate(
    ctx.organizationId,
    data.currencyCode,
    data.date
  );

  // Resolve the tax treatment, if any. Kinds that carry no cash-side tax leg
  // (exempt / no_vat) fall through to a plain 2-leg entry.
  let taxRow: { rate: number; kind: string; recoverablePercent: number } | null = null;
  if (data.taxRateId) {
    const found = await tx.query.taxRate.findFirst({
      where: eq(taxRate.id, data.taxRateId),
      columns: { rate: true, kind: true, recoverablePercent: true },
    });
    if (found) taxRow = found;
  }
  const isUsSalesTax = taxRow?.kind === "sales_tax_us";
  // Reverse charge is self-accounted (DR input + CR output VAT) on the PURCHASE
  // (money-out) side only; the amount that left the bank IS the net (the
  // supplier charged no VAT). Money-in reverse charge has no cash-side leg.
  const isReverseCharge =
    taxRow?.kind === "reverse_charge" && taxRow.rate > 0 && !moneyIn;
  const noTaxLeg =
    !taxRow ||
    taxRow.rate <= 0 ||
    taxRow.kind === "exempt" ||
    taxRow.kind === "no_vat" ||
    (taxRow.kind === "reverse_charge" && !isReverseCharge);

  const [entry] = await tx
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date: data.date,
      description: data.description,
      reference: data.reference,
      status: "posted",
      sourceType: "bank_categorization",
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  const mk = (
    accountId: string,
    debit: number,
    credit: number
  ): typeof journalLine.$inferInsert => ({
    journalEntryId: entry.id,
    accountId,
    description: data.description,
    debitAmount: debit,
    creditAmount: credit,
    // Tracking (cost centre / project) belongs only on the categorized line —
    // not the bank leg or the tax control legs.
    ...(accountId === data.otherAccountId
      ? { costCenterId: data.costCenterId ?? null, projectId: data.projectId ?? null }
      : {}),
  });

  const lines: (typeof journalLine.$inferInsert)[] = [];

  if (noTaxLeg || (!moneyIn && isUsSalesTax)) {
    // Plain 2-leg. US sales tax on a PURCHASE is non-recoverable, so the whole
    // gross is absorbed into the chosen account (no separate tax leg).
    lines.push(mk(data.bankGlAccountId, moneyIn ? abs : 0, moneyIn ? 0 : abs));
    lines.push(mk(data.otherAccountId, moneyIn ? 0 : abs, moneyIn ? abs : 0));
  } else if (isReverseCharge) {
    // Reverse-charge purchase: the supplier charged no VAT, so `abs` IS the net
    // and only `abs` left the bank. The buyer self-accounts the notional VAT in
    // BOTH boxes — DR Input VAT (recoverable slice) and CR Output VAT (full
    // rate×net) — net-zero cash. Any blocked slice is absorbed into the expense.
    const notionalVat = Math.round((abs * taxRow!.rate) / 10000);
    const recoverableVat = Math.round(
      (notionalVat * taxRow!.recoverablePercent) / 10000
    );
    const absorbedVat = notionalVat - recoverableVat;
    const outputControl = await ensureControlAccount(
      ctx.organizationId,
      "outputVat",
      base,
      tx
    );
    const inputControl =
      recoverableVat > 0
        ? await ensureControlAccount(ctx.organizationId, "inputVat", base, tx)
        : null;
    // Need an output-VAT account to self-account, and an input-VAT account if
    // there's a recoverable slice. If either is missing (unreachable —
    // ensureControlAccount creates on demand), fall back to a plain net entry
    // so the books stay balanced rather than posting a one-sided VAT leg.
    const canSelfAccount =
      notionalVat > 0 && outputControl && (recoverableVat === 0 || inputControl);
    if (canSelfAccount) {
      // CR bank (cash actually paid) and CR output VAT (self-accounted).
      lines.push(mk(data.bankGlAccountId, 0, abs));
      // DR expense: net + any blocked VAT absorbed into cost.
      lines.push(mk(data.otherAccountId, abs + absorbedVat, 0));
      if (inputControl && recoverableVat > 0) {
        lines.push(mk(inputControl.id, recoverableVat, 0));
      }
      lines.push(mk(outputControl!.id, 0, notionalVat));
    } else {
      lines.push(mk(data.bankGlAccountId, 0, abs));
      lines.push(mk(data.otherAccountId, abs, 0));
    }
  } else if (moneyIn) {
    // Sale: bank gets gross; revenue gets net; tax collected is a liability
    // (output VAT, or US sales-tax payable). Fold tax into revenue if no control account.
    const tax = Math.round((abs * taxRow!.rate) / (10000 + taxRow!.rate));
    const net = abs - tax;
    const control = await ensureControlAccount(
      ctx.organizationId,
      isUsSalesTax || (await orgIsUsSalesTax(ctx.organizationId, tx)) ? "salesTaxPayable" : "outputVat",
      base,
      tx
    );
    lines.push(mk(data.bankGlAccountId, abs, 0));
    if (control && tax > 0) {
      lines.push(mk(data.otherAccountId, 0, net));
      lines.push(mk(control.id, 0, tax));
    } else {
      lines.push(mk(data.otherAccountId, 0, abs));
    }
  } else {
    // Purchase with VAT/GST: reclaim the recoverable slice to input VAT, absorb
    // the blocked slice into the expense/asset. Fold recoverable into the
    // expense too if there's no input-VAT control account to post it to.
    const { net, recoverableTax, absorbedTax } = splitGrossTax(
      abs,
      taxRow!.rate,
      taxRow!.recoverablePercent
    );
    const inputControl =
      recoverableTax > 0
        ? await ensureControlAccount(ctx.organizationId, "inputVat", base, tx)
        : null;
    if (inputControl && recoverableTax > 0) {
      lines.push(mk(data.otherAccountId, net + absorbedTax, 0));
      lines.push(mk(inputControl.id, recoverableTax, 0));
    } else {
      lines.push(mk(data.otherAccountId, abs, 0));
    }
    lines.push(mk(data.bankGlAccountId, 0, abs));
  }

  await tx.insert(journalLine).values(toBaseLines(lines, currency, rate));

  return entry;
}

/**
 * Cost of goods sold posting for the stock lines on a sale (or the reversal of
 * one on void/credit-note). For each line that references an inventory item:
 *   sale:    relieve stock (avg or FIFO) → DR COGS / CR Inventory at the issued cost
 *   reverse: restock at the item's current average cost → DR Inventory / CR COGS
 * Posts ONE entry for all stock lines, in base currency (inventory is valued in
 * base), and stamps the inventory movement(s) with the entry id. Returns null
 * when there are no stock lines (so service-only invoices post nothing extra).
 *
 * Line quantities are the document scale (x100); converted to whole units.
 */
export async function createCogsJournalEntry(
  ctx: JournalAutomationContext,
  data: {
    reference: string;
    date: string;
    currencyCode?: string;
    lines: { inventoryItemId: string; quantity: number; warehouseId?: string | null }[];
  },
  tx: Tx,
  opts?: { reverse?: boolean }
) {
  const reverse = opts?.reverse ?? false;
  const { base } = await resolveBaseRate(ctx.organizationId, data.currencyCode, data.date);

  const legs: (typeof journalLine.$inferInsert)[] = [];
  const movementIds: string[] = [];
  let entryId: string | null = null;

  // Lazily create the header only once we know there's at least one stock line.
  const ensureEntry = async () => {
    if (entryId) return entryId;
    const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
    const [entry] = await tx
      .insert(journalEntry)
      .values({
        organizationId: ctx.organizationId,
        entryNumber,
        date: data.date,
        description: reverse ? `Restock ${data.reference}` : `Cost of sales ${data.reference}`,
        reference: data.reference,
        status: "posted",
        sourceType: reverse ? "inventory_cogs_reversal" : "inventory_cogs",
        postedAt: new Date(),
        createdBy: ctx.userId,
      })
      .returning();
    entryId = entry.id;
    return entryId;
  };

  for (const line of data.lines) {
    const units = Math.round(line.quantity / 100);
    if (units <= 0) continue;
    const item = await tx.query.inventoryItem.findFirst({
      where: and(eq(inventoryItem.id, line.inventoryItemId), eq(inventoryItem.organizationId, ctx.organizationId)),
    });
    if (!item) continue;

    const cogsAcct =
      (item.costAccountId ? { id: item.costAccountId } : null) ??
      (await ensureControlAccount(ctx.organizationId, "cogs", base, tx));
    const invAcct =
      (item.inventoryAccountId ? { id: item.inventoryAccountId } : null) ??
      (await ensureControlAccount(ctx.organizationId, "inventory", base, tx));
    if (!cogsAcct || !invAcct) continue;

    const id = await ensureEntry();
    let cost: number;
    let movementId: string;
    if (reverse) {
      const r = await recordInventoryReceipt(tx, {
        item: item as ValuedItem,
        quantity: units,
        unitCost: item.averageCost,
        warehouseId: line.warehouseId,
        type: "adjustment",
        referenceType: "sale_reversal",
        referenceId: null,
      });
      cost = item.averageCost * units;
      movementId = r.movementId;
      legs.push(
        { journalEntryId: id, accountId: invAcct.id, description: "Restock", debitAmount: cost, creditAmount: 0, currencyCode: base },
        { journalEntryId: id, accountId: cogsAcct.id, description: "Restock", debitAmount: 0, creditAmount: cost, currencyCode: base }
      );
    } else {
      const r = await recordInventoryIssue(tx, {
        item: item as ValuedItem,
        quantity: units,
        warehouseId: line.warehouseId,
        type: "sale",
        referenceType: "sale",
        referenceId: null,
      });
      cost = r.cost;
      movementId = r.movementId;
      legs.push(
        { journalEntryId: id, accountId: cogsAcct.id, description: "Cost of sales", debitAmount: cost, creditAmount: 0, currencyCode: base },
        { journalEntryId: id, accountId: invAcct.id, description: "Cost of sales", debitAmount: 0, creditAmount: cost, currencyCode: base }
      );
    }
    movementIds.push(movementId);
  }

  if (!entryId || legs.length === 0) return null;
  await tx.insert(journalLine).values(legs);
  if (movementIds.length > 0) {
    await tx
      .update(inventoryMovement)
      .set({ journalEntryId: entryId })
      .where(inArray(inventoryMovement.id, movementIds));
  }
  return { id: entryId };
}

/**
 * For bill posting: swap the debit account of any stock line (inventoryItemId
 * set) to the item's Inventory account (fallback control 1300), so buying stock
 * capitalises into Inventory instead of hitting an expense. Non-stock lines are
 * passed through unchanged. Returns the {accountId, amount, taxAmount} shape
 * createBillJournalEntry expects.
 */
export async function mapBillLinesForPosting(
  organizationId: string,
  lines: { accountId: string | null; amount: number; taxAmount: number; taxRateId?: string | null; inventoryItemId?: string | null }[]
): Promise<{ accountId: string | null; amount: number; taxAmount: number; taxRateId?: string | null }[]> {
  const hasStock = lines.some((l) => l.inventoryItemId);
  let inventoryFallbackId: string | null = null;
  if (hasStock) {
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, organizationId),
      columns: { defaultCurrency: true },
    });
    const inv = await ensureControlAccount(organizationId, "inventory", org?.defaultCurrency ?? "USD");
    inventoryFallbackId = inv?.id ?? null;
  }
  const out: { accountId: string | null; amount: number; taxAmount: number; taxRateId?: string | null }[] = [];
  for (const l of lines) {
    // Preserve the per-line taxRateId so createBillJournalEntry can run the
    // recoverable/blocked/reverse-charge split (stock or not).
    if (l.inventoryItemId) {
      const item = await db.query.inventoryItem.findFirst({
        where: eq(inventoryItem.id, l.inventoryItemId),
        columns: { inventoryAccountId: true },
      });
      out.push({ accountId: item?.inventoryAccountId ?? inventoryFallbackId, amount: l.amount, taxAmount: l.taxAmount, taxRateId: l.taxRateId ?? null });
    } else {
      out.push({ accountId: l.accountId, amount: l.amount, taxAmount: l.taxAmount, taxRateId: l.taxRateId ?? null });
    }
  }
  return out;
}

/**
 * Record the perpetual-inventory receipt side of a posted bill: for each stock
 * line, increase on-hand qty + value (average blend / FIFO layer) at the line's
 * net unit cost. The GL debit to Inventory is posted by the bill journal entry
 * (see mapBillLinesForPosting), so this does NOT post the GL — it only moves stock.
 */
export async function recordBillStockReceipts(
  ctx: JournalAutomationContext,
  lines: { inventoryItemId?: string | null; amount: number; quantity: number; warehouseId?: string | null }[],
  tx: Tx
): Promise<void> {
  for (const l of lines) {
    if (!l.inventoryItemId) continue;
    const units = Math.round(l.quantity / 100);
    if (units <= 0) continue;
    const item = await tx.query.inventoryItem.findFirst({
      where: and(eq(inventoryItem.id, l.inventoryItemId), eq(inventoryItem.organizationId, ctx.organizationId)),
    });
    if (!item) continue;
    const unitCost = Math.round(l.amount / units); // net cost per unit
    await recordInventoryReceipt(tx, {
      item: item as ValuedItem,
      quantity: units,
      unitCost,
      warehouseId: l.warehouseId,
      type: "purchase",
      referenceType: "bill",
      referenceId: null,
    });
  }
}

/**
 * Inventory quantity adjustment (shrinkage / found stock) with GL posting.
 *   loss  (qtyDelta < 0): relieve stock at cost → DR Inventory Shrinkage / CR Inventory
 *   found (qtyDelta > 0): add stock at current avg → DR Inventory / CR Inventory Shrinkage
 * Records the movement + valuation change and stamps it with the entry id.
 * Returns { movementId, entryId } (entryId null when the cost is zero).
 */
export async function createInventoryAdjustmentJournalEntry(
  ctx: JournalAutomationContext,
  data: { item: ValuedItem & { inventoryAccountId?: string | null }; qtyDelta: number; reason?: string | null; date: string },
  tx: Tx
): Promise<{ movementId: string; entryId: string | null } | null> {
  if (data.qtyDelta === 0) return null;
  const { base } = await resolveBaseRate(ctx.organizationId, undefined, data.date);
  const invAcct =
    (data.item.inventoryAccountId ? { id: data.item.inventoryAccountId } : null) ??
    (await ensureControlAccount(ctx.organizationId, "inventory", base, tx));
  const shrinkAcct = await ensureControlAccount(ctx.organizationId, "inventoryShrinkage", base, tx);
  if (!invAcct || !shrinkAcct) return null;

  const loss = data.qtyDelta < 0;
  let cost: number;
  let movementId: string;
  if (loss) {
    const r = await recordInventoryIssue(tx, { item: data.item, quantity: -data.qtyDelta, type: "adjustment", referenceType: "adjustment", referenceId: null });
    cost = r.cost;
    movementId = r.movementId;
  } else {
    const r = await recordInventoryReceipt(tx, { item: data.item, quantity: data.qtyDelta, unitCost: data.item.averageCost, type: "adjustment", referenceType: "adjustment", referenceId: null });
    cost = data.item.averageCost * data.qtyDelta;
    movementId = r.movementId;
  }

  if (cost === 0) return { movementId, entryId: null };

  const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
  const [entry] = await tx
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date: data.date,
      description: `Inventory adjustment${data.reason ? ` — ${data.reason}` : ""}`,
      reference: "INV-ADJ",
      status: "posted",
      sourceType: "inventory_adjustment",
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  await tx.insert(journalLine).values(
    loss
      ? [
          { journalEntryId: entry.id, accountId: shrinkAcct.id, description: "Inventory shrinkage", debitAmount: cost, creditAmount: 0, currencyCode: base },
          { journalEntryId: entry.id, accountId: invAcct.id, description: "Inventory shrinkage", debitAmount: 0, creditAmount: cost, currencyCode: base },
        ]
      : [
          { journalEntryId: entry.id, accountId: invAcct.id, description: "Inventory found", debitAmount: cost, creditAmount: 0, currencyCode: base },
          { journalEntryId: entry.id, accountId: shrinkAcct.id, description: "Inventory found", debitAmount: 0, creditAmount: cost, currencyCode: base },
        ]
  );

  await tx.update(inventoryMovement).set({ journalEntryId: entry.id }).where(eq(inventoryMovement.id, movementId));
  return { movementId, entryId: entry.id };
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

/**
 * Sum the posted debit/credit on a single control account over a date range
 * (inclusive), org-scoped. Only posted entries are counted — drafts and voids
 * are excluded — so the clearing entry reflects what actually hit the ledger.
 */
async function sumControlAccountActivity(
  exec: DbOrTx,
  organizationId: string,
  accountId: string,
  startDate: string,
  endDate: string
): Promise<{ debit: number; credit: number }> {
  const [row] = await exec
    .select({
      debit: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`.mapWith(Number),
      credit: sql<number>`coalesce(sum(${journalLine.creditAmount}), 0)`.mapWith(Number),
    })
    .from(journalLine)
    .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
    .where(
      and(
        eq(journalEntry.organizationId, organizationId),
        eq(journalLine.accountId, accountId),
        eq(journalEntry.status, "posted"),
        sql`${journalEntry.date} >= ${startDate}`,
        sql`${journalEntry.date} <= ${endDate}`
      )
    );
  return { debit: row?.debit ?? 0, credit: row?.credit ?? 0 };
}

/**
 * Create the VAT-return clearing journal entry for a filing period.
 *
 * Reads the posted balances on the two VAT control accounts over
 * [periodStartDate, periodEndDate] and moves them into the VAT Suspense /
 * return-clearing account (2240), leaving 2200 and 1500 flat for the period:
 *   • Output VAT (2200) balance = credits − debits  → DR 2200 to zero it
 *   • Input VAT  (1500) balance = debits − credits  → CR 1500 to zero it
 *   • NET (output − input) booked to VAT Suspense (2240):
 *       net > 0 (payable to authority): CR 2240
 *       net < 0 (refund from authority): DR 2240
 *
 * Posted in base currency (control accounts are already carried in base, so the
 * legs are 1:1). Balanced to the cent by construction (suspense = output − input).
 *
 * The two control balances can be supplied EXPLICITLY via `outputBalance` /
 * `inputBalance` (base-currency cents, in the same natural sign this function
 * computes: output = credits − debits, input = debits − credits). This lets the
 * filing route post a clearing entry that matches the basis-aware figures it
 * froze (e.g. CASH-basis boxes) instead of re-deriving on the accrual basis,
 * which would otherwise drift from the filed return. When BOTH are omitted the
 * function falls back to its historical accrual recompute over the period.
 */
export async function createVatReturnClearingJournalEntry(
  ctx: JournalAutomationContext,
  data: {
    date: string;
    periodStartDate: string;
    periodEndDate: string;
    reference?: string;
    // Optional explicit balances to clear (base-currency cents). Output is
    // credit-natural (credits − debits); input is debit-natural (debits −
    // credits). Supply BOTH to match a frozen basis-aware return; omit both for
    // the legacy accrual recompute.
    outputBalance?: number;
    inputBalance?: number;
    // Optional split of outputBalance across the accounts holding tax
    // collected (Output VAT 2200 and US Sales Tax Payable 2230). Must add up to
    // outputBalance. Omit to clear everything from Output VAT 2200.
    outputSplit?: { accountId: string; amount: number }[];
  },
  tx: Tx
) {
  const org = await db.query.organization.findFirst({
    where: eq(organization.id, ctx.organizationId),
    columns: { defaultCurrency: true },
  });
  const base = org?.defaultCurrency ?? "USD";

  const outputAcct = await ensureControlAccount(ctx.organizationId, "outputVat", base, tx);
  const inputAcct = await ensureControlAccount(ctx.organizationId, "inputVat", base, tx);
  const suspenseAcct = await ensureControlAccount(ctx.organizationId, "vatSuspense", base, tx);
  if (!outputAcct || !inputAcct || !suspenseAcct) return null;

  // Use the caller's explicit balances when BOTH are supplied (so the clearing
  // entry matches a frozen, basis-aware return); otherwise recompute on the
  // accrual basis over the period (legacy behaviour).
  const hasExplicit =
    data.outputBalance !== undefined && data.inputBalance !== undefined;

  let outputBalance: number;
  let inputBalance: number;
  if (hasExplicit) {
    outputBalance = data.outputBalance!;
    inputBalance = data.inputBalance!;
  } else {
    const outputActivity = await sumControlAccountActivity(
      tx,
      ctx.organizationId,
      outputAcct.id,
      data.periodStartDate,
      data.periodEndDate
    );
    const inputActivity = await sumControlAccountActivity(
      tx,
      ctx.organizationId,
      inputAcct.id,
      data.periodStartDate,
      data.periodEndDate
    );
    // Liability balance on output VAT (credit-normal): credits − debits.
    outputBalance = outputActivity.credit - outputActivity.debit;
    // Asset balance on input VAT (debit-normal): debits − credits.
    inputBalance = inputActivity.debit - inputActivity.credit;
  }
  // Net owed to the authority (positive) or reclaimable (negative).
  const net = outputBalance - inputBalance;

  const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
  const reference = data.reference ?? `VAT ${data.periodStartDate}..${data.periodEndDate}`;
  const description = `VAT return clearing ${data.periodStartDate} to ${data.periodEndDate}`;

  const [entry] = await tx
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date: data.date,
      description,
      reference,
      status: "posted",
      sourceType: "vat_return",
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  const lines: (typeof journalLine.$inferInsert)[] = [];

  // Zero the output VAT liability: DR if it was a credit balance, CR if it
  // somehow carried a net debit balance (e.g. credit notes exceeded sales).
  const outputParts =
    data.outputSplit && data.outputSplit.reduce((sum, p) => sum + p.amount, 0) === outputBalance
      ? data.outputSplit
      : [{ accountId: outputAcct.id, amount: outputBalance }];
  for (const part of outputParts) {
    if (part.amount === 0) continue;
    lines.push({
      journalEntryId: entry.id,
      accountId: part.accountId,
      description: "Clear output VAT",
      debitAmount: part.amount > 0 ? part.amount : 0,
      creditAmount: part.amount < 0 ? -part.amount : 0,
      currencyCode: base,
    });
  }

  // Zero the input VAT asset: CR if it was a debit balance, DR if it carried a
  // net credit balance.
  if (inputBalance !== 0) {
    lines.push({
      journalEntryId: entry.id,
      accountId: inputAcct.id,
      description: "Clear input VAT",
      debitAmount: inputBalance < 0 ? -inputBalance : 0,
      creditAmount: inputBalance > 0 ? inputBalance : 0,
      currencyCode: base,
    });
  }

  // Book the net to VAT Suspense: CR if payable to authority, DR if refund.
  if (net !== 0) {
    lines.push({
      journalEntryId: entry.id,
      accountId: suspenseAcct.id,
      description: net > 0 ? "VAT payable to authority" : "VAT refund from authority",
      debitAmount: net < 0 ? -net : 0,
      creditAmount: net > 0 ? net : 0,
      currencyCode: base,
    });
  }

  if (lines.length > 0) {
    await tx.insert(journalLine).values(lines);
  }

  return { entry, outputBalance, inputBalance, net };
}

/**
 * Record the cash settlement of a VAT return against the VAT Suspense /
 * return-clearing account (2240) — clearing the liability/receivable booked by
 * createVatReturnClearingJournalEntry.
 *
 *   payment to authority (isRefund=false): DR 2240 Suspense / CR bank GL
 *   refund from authority (isRefund=true):  DR bank GL / CR 2240 Suspense
 *
 * `amount` is a positive base-currency cents value. Posted in base currency.
 */
export async function recordTaxSettlementJournalEntry(
  ctx: JournalAutomationContext,
  data: {
    bankGlAccountId: string;
    amount: number; // positive base-currency cents
    date: string;
    reference?: string;
    isRefund: boolean;
  },
  tx: Tx
) {
  const abs = Math.abs(data.amount);
  if (abs === 0) return null;

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, ctx.organizationId),
    columns: { defaultCurrency: true },
  });
  const base = org?.defaultCurrency ?? "USD";

  const suspenseAcct = await ensureControlAccount(ctx.organizationId, "vatSuspense", base, tx);
  if (!suspenseAcct) return null;

  const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
  const reference = data.reference ?? (data.isRefund ? "VAT refund" : "VAT payment");
  const description = data.isRefund
    ? "VAT refund received from authority"
    : "VAT payment to authority";

  const [entry] = await tx
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date: data.date,
      description,
      reference,
      status: "posted",
      sourceType: "tax_settlement",
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  const mk = (
    accountId: string,
    debit: number,
    credit: number
  ): typeof journalLine.$inferInsert => ({
    journalEntryId: entry.id,
    accountId,
    description,
    debitAmount: debit,
    creditAmount: credit,
    currencyCode: base,
  });

  if (data.isRefund) {
    // DR bank GL / CR Suspense
    await tx.insert(journalLine).values([
      mk(data.bankGlAccountId, abs, 0),
      mk(suspenseAcct.id, 0, abs),
    ]);
  } else {
    // DR Suspense / CR bank GL
    await tx.insert(journalLine).values([
      mk(suspenseAcct.id, abs, 0),
      mk(data.bankGlAccountId, 0, abs),
    ]);
  }

  return entry;
}

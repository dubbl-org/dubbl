import { db } from "@/lib/db";
import { journalEntry, journalLine, chartAccount } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

interface JournalAutomationContext {
  organizationId: string;
  userId: string;
}

/**
 * Find or create a system account by code/type for the given org.
 */
async function findAccountByCode(organizationId: string, code: string) {
  return db.query.chartAccount.findFirst({
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

  // DR Accounts Receivable for total
  lines.push({
    journalEntryId: entry.id,
    accountId: arAccount.id,
    description: `Invoice ${invoiceData.invoiceNumber}`,
    debitAmount: invoiceData.total,
    creditAmount: 0,
  });

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

  if (lines.length > 0) {
    await db.insert(journalLine).values(lines);
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

  // CR Accounts Payable for total
  lines.push({
    journalEntryId: entry.id,
    accountId: apAccount.id,
    description: `Bill ${billData.billNumber}`,
    debitAmount: 0,
    creditAmount: billData.total,
  });

  if (lines.length > 0) {
    await db.insert(journalLine).values(lines);
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
  }
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

  const [entry] = await db
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

  await db.insert(journalLine).values([
    {
      journalEntryId: entry.id,
      accountId: isInvoice ? bankAccount.id : counterAccount.id,
      description: `Payment for ${paymentData.reference}`,
      debitAmount: paymentData.amount,
      creditAmount: 0,
    },
    {
      journalEntryId: entry.id,
      accountId: isInvoice ? counterAccount.id : bankAccount.id,
      description: `Payment for ${paymentData.reference}`,
      debitAmount: 0,
      creditAmount: paymentData.amount,
    },
  ]);

  return entry;
}

/**
 * Create journal entry for FX gain/loss.
 * Gain: DR Bank, CR FX Gain (4200)
 * Loss: DR FX Loss (5200), CR Bank
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

  // FX Gain account "4200" (revenue), FX Loss account "5200" (expense)
  const isGain = data.amount > 0;
  const fxAccount = await findAccountByCode(ctx.organizationId, isGain ? "4200" : "5200");
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

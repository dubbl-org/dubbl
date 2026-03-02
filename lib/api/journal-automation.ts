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

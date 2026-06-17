import { journalEntry, journalLine } from "@/lib/db/schema";
import {
  getNextEntryNumber,
  ensureAccountByCode,
  resolveBaseRate,
  toBaseLines,
} from "@/lib/api/journal-automation";
import { db } from "@/lib/db";

/** A transaction handle, derived from db.transaction's callback parameter. */
type Tx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

interface ExpenseClaimContext {
  organizationId: string;
  userId: string;
}

/** Shape of an expense claim (with its items) needed to post its journals. */
interface ExpenseClaimForPosting {
  id: string;
  title: string;
  totalAmount: number;
  currencyCode?: string | null;
  items: {
    accountId?: string | null;
    amount: number;
    description?: string | null;
  }[];
}

/** A chart account referenced by a posting helper. */
interface AccountRef {
  id: string;
}

/** Employee Reimbursements Payable — the AP-style obligation owed to the claimant. */
const EMPLOYEE_REIMBURSEMENTS_PAYABLE = {
  code: "2110",
  name: "Employee Reimbursements Payable",
  type: "liability" as const,
  subType: "current",
};

/** Per-line expense fallback when an item has no account assigned.
 * NOTE: code 5000 is Cost of Goods Sold in this chart — Miscellaneous Expense is
 * 5990. Using 5000 here would pollute COGS / gross margin. */
const MISC_EXPENSE = {
  code: "5990",
  name: "Miscellaneous Expense",
  type: "expense" as const,
  subType: "operating",
};

/**
 * Post the approval of an employee expense claim.
 *
 * DR each expense line to its expense account (falling back to Miscellaneous
 * Expense 5990 per line when the item has no account assigned)
 * CR Employee Reimbursements Payable (2110) for the claim total
 *
 * Recognizing the obligation at approval makes the reimbursable visible in AP /
 * aged-payables between approval and payment, and keeps period-end accruals
 * correct. Amounts are integer cents in the claim currency and converted to the
 * org base currency so the GL stays balanced. Returns the created journal entry.
 */
export async function createExpenseClaimApprovalJournalEntry(
  ctx: ExpenseClaimContext,
  claim: ExpenseClaimForPosting,
  tx: Tx,
  date: string
) {
  const { base, currency, rate } = await resolveBaseRate(
    ctx.organizationId,
    claim.currencyCode ?? undefined,
    date
  );

  // Resolve the expense account per line, defaulting to Miscellaneous Expense.
  let miscExpense: AccountRef | null = null;
  const ensureMisc = async (): Promise<AccountRef> => {
    if (miscExpense) return miscExpense;
    const acct = await ensureAccountByCode(ctx.organizationId, MISC_EXPENSE, base, tx);
    if (!acct) throw new Error("Could not resolve Miscellaneous Expense account (5990)");
    miscExpense = acct;
    return acct;
  };

  const payable = await ensureAccountByCode(
    ctx.organizationId,
    EMPLOYEE_REIMBURSEMENTS_PAYABLE,
    base,
    tx
  );
  if (!payable) {
    throw new Error("Could not resolve Employee Reimbursements Payable account (2110)");
  }

  const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
  const [entry] = await tx
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date,
      description: `Expense claim approved: ${claim.title}`,
      reference: `EXP-${claim.id.slice(0, 8)}`,
      status: "posted",
      sourceType: "expense_claim",
      sourceId: claim.id,
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  const lines: (typeof journalLine.$inferInsert)[] = [];
  let debitTotal = 0;

  for (const item of claim.items) {
    if (item.amount <= 0) continue;
    const account = item.accountId
      ? ({ id: item.accountId } as AccountRef)
      : await ensureMisc();
    lines.push({
      journalEntryId: entry.id,
      accountId: account.id,
      description: item.description ?? claim.title,
      debitAmount: item.amount,
      creditAmount: 0,
    });
    debitTotal += item.amount;
  }

  // CR the payable for the same total as the debits so the entry balances even
  // if line amounts don't sum to the stored totalAmount.
  lines.push({
    journalEntryId: entry.id,
    accountId: payable.id,
    description: `Reimbursement owed: ${claim.title}`,
    debitAmount: 0,
    creditAmount: debitTotal,
  });

  const baseLines = toBaseLines(lines, currency, rate);
  await tx.insert(journalLine).values(baseLines);

  return entry;
}

/**
 * Post the payment of a previously-approved employee expense claim.
 *
 * DR Employee Reimbursements Payable (2110) — clears the obligation recognized
 *    at approval
 * CR Bank/Cash — the funds paid to the claimant
 *
 * This intentionally clears the 2110 payable rather than re-debiting the expense
 * accounts (the expenses were already booked at approval). Amounts are integer
 * cents in the claim currency, converted to the org base currency. Returns the
 * created journal entry.
 */
export async function createExpenseClaimPaymentJournalEntry(
  ctx: ExpenseClaimContext,
  claim: ExpenseClaimForPosting,
  bankAccount: AccountRef,
  tx: Tx,
  date: string
) {
  const { base, currency, rate } = await resolveBaseRate(
    ctx.organizationId,
    claim.currencyCode ?? undefined,
    date
  );

  const payable = await ensureAccountByCode(
    ctx.organizationId,
    EMPLOYEE_REIMBURSEMENTS_PAYABLE,
    base,
    tx
  );
  if (!payable) {
    throw new Error("Could not resolve Employee Reimbursements Payable account (2110)");
  }

  const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
  const [entry] = await tx
    .insert(journalEntry)
    .values({
      organizationId: ctx.organizationId,
      entryNumber,
      date,
      description: `Expense claim paid: ${claim.title}`,
      reference: `EXP-${claim.id.slice(0, 8)}`,
      status: "posted",
      sourceType: "expense_claim_payment",
      sourceId: claim.id,
      postedAt: new Date(),
      createdBy: ctx.userId,
    })
    .returning();

  const lines: (typeof journalLine.$inferInsert)[] = [
    {
      journalEntryId: entry.id,
      accountId: payable.id,
      description: `Reimbursement settled: ${claim.title}`,
      debitAmount: claim.totalAmount,
      creditAmount: 0,
    },
    {
      journalEntryId: entry.id,
      accountId: bankAccount.id,
      description: `Expense claim payment: ${claim.title}`,
      debitAmount: 0,
      creditAmount: claim.totalAmount,
    },
  ];

  const baseLines = toBaseLines(lines, currency, rate);
  await tx.insert(journalLine).values(baseLines);

  return entry;
}

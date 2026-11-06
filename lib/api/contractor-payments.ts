import { db } from "@/lib/db";
import { contractor, contractorPayment, journalEntry, journalLine, payrollSettings } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { assertNotLocked } from "@/lib/api/period-lock";
import {
  ensureAccountByCode,
  findAccountByCode,
  getNextEntryNumber,
  resolveBaseRate,
  toBaseLines,
} from "@/lib/api/journal-automation";

import { ApprovalError } from "@/lib/approvals/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * Pay a pending contractor payment: post DR Subcontractor Expense (5130) /
 * CR the payroll bank account (payroll settings, else 1100 Checking Account,
 * created if missing) and mark it paid, in one transaction. Foreign-currency
 * payments are converted to the base currency at the day's rate.
 */
export async function processContractorPayment(ctx: AuthContext, id: string, paymentId: string) {
  // The contractor must belong to this org, and the payment to the contractor.
  const owner = await db.query.contractor.findFirst({
    where: and(
      eq(contractor.id, id),
      eq(contractor.organizationId, ctx.organizationId),
      notDeleted(contractor.deletedAt)
    ),
    columns: { id: true, name: true },
  });
  if (!owner) throw new ApprovalError("Contractor not found", 404);

  const payment = await db.query.contractorPayment.findFirst({
    where: and(eq(contractorPayment.id, paymentId), eq(contractorPayment.contractorId, owner.id)),
  });

  if (!payment) throw new ApprovalError("Payment not found", 404);
  if (payment.status !== "pending") throw new ApprovalError("Only pending payments can be processed");

  const date = new Date().toISOString().split("T")[0];
  await assertNotLocked(ctx.organizationId, date, ctx);
  // Throws MissingExchangeRateError (422) before anything is written.
  const { base, currency, rate } = await resolveBaseRate(ctx.organizationId, payment.currency ?? undefined, date);

  const settings = await db.query.payrollSettings.findFirst({
    where: eq(payrollSettings.organizationId, ctx.organizationId),
    columns: { bankAccountCode: true },
  });
  const bankCode = settings?.bankAccountCode || "1100";

  const updated = await db.transaction(async (tx) => {
    // Contractor (1099) cost is Subcontractor Expense (5130), NOT employee
    // Wages (5100) — keep contractor cost out of the employee payroll line.
    const expenseAccount = await ensureAccountByCode(
      ctx.organizationId,
      { code: "5130", name: "Subcontractor Expense", type: "expense", subType: "operating" },
      base,
      tx
    );
    const bankAccount =
      (await findAccountByCode(ctx.organizationId, bankCode, tx)) ??
      (await ensureAccountByCode(
        ctx.organizationId,
        { code: "1100", name: "Checking Account", type: "asset", subType: "bank" },
        base,
        tx
      ));
    if (!expenseAccount || !bankAccount) throw new Error("Could not resolve contractor payment accounts");

    const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
    const [entry] = await tx
      .insert(journalEntry)
      .values({
        organizationId: ctx.organizationId,
        entryNumber,
        date,
        description: `Contractor payment - ${owner.name}${payment.description ? `: ${payment.description}` : ""}`,
        reference: payment.invoiceNumber || `CP-${paymentId.slice(0, 8)}`,
        status: "posted",
        sourceType: "contractor_payment",
        sourceId: paymentId,
        postedAt: new Date(),
        createdBy: ctx.userId,
      })
      .returning();

    await tx.insert(journalLine).values(
      toBaseLines(
        [
          {
            journalEntryId: entry.id,
            accountId: expenseAccount.id,
            description: "Subcontractor expense",
            debitAmount: payment.amount,
            creditAmount: 0,
          },
          {
            journalEntryId: entry.id,
            accountId: bankAccount.id,
            description: "Contractor payment",
            debitAmount: 0,
            creditAmount: payment.amount,
          },
        ],
        currency,
        rate
      )
    );

    const [row] = await tx
      .update(contractorPayment)
      .set({ status: "paid", paidAt: new Date(), journalEntryId: entry.id })
      .where(eq(contractorPayment.id, paymentId))
      .returning();
    return row;
  });

  return updated;
}

import { db } from "@/lib/db";
import { contractorPayment, journalEntry, journalLine, chartAccount, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound, validationError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { ensureAccountByCode, getNextEntryNumber } from "@/lib/api/journal-automation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  try {
    const { id, paymentId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contractors");

    const payment = await db.query.contractorPayment.findFirst({
      where: eq(contractorPayment.id, paymentId),
    });

    if (!payment) return notFound("Payment");
    if (payment.status !== "pending") return validationError("Only pending payments can be processed");

    // Resolve the org base currency so any auto-created accounts are stamped with it.
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
      columns: { defaultCurrency: true },
    });
    const baseCurrency = org?.defaultCurrency ?? "USD";

    // Contractor (1099) cost is Subcontractor Expense (5130), NOT employee
    // Wages (5100) — keep contractor cost out of the employee payroll line.
    const expenseAccount = await ensureAccountByCode(
      ctx.organizationId,
      { code: "5130", name: "Subcontractor Expense", type: "expense", subType: "operating" },
      baseCurrency
    );

    const bankAccount = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        eq(chartAccount.code, "1100")
      ),
    });

    let journalEntryId: string | null = null;

    if (expenseAccount && bankAccount) {
      // Post one balanced entry: DR Subcontractor Expense / CR Bank.
      journalEntryId = await db.transaction(async (tx) => {
        const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);

        const [entry] = await tx
          .insert(journalEntry)
          .values({
            organizationId: ctx.organizationId,
            entryNumber,
            date: new Date().toISOString().split("T")[0],
            description: `Contractor payment - ${payment.description || paymentId.slice(0, 8)}`,
            reference: `CP-${paymentId.slice(0, 8)}`,
            status: "posted",
            sourceType: "contractor_payment",
            sourceId: paymentId,
            postedAt: new Date(),
            createdBy: ctx.userId,
          })
          .returning();

        await tx.insert(journalLine).values([
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
        ]);

        return entry.id;
      });
    }

    const [updated] = await db
      .update(contractorPayment)
      .set({
        status: "paid",
        paidAt: new Date(),
        journalEntryId,
      })
      .where(eq(contractorPayment.id, paymentId))
      .returning();

    logAudit({ ctx, action: "process", entityType: "contractorPayment", entityId: paymentId, request });

    return ok({ payment: updated });
  } catch (err) {
    return handleError(err);
  }
}

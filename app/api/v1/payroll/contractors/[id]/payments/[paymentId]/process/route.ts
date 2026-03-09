import { db } from "@/lib/db";
import { contractorPayment, contractor, journalEntry, journalLine, chartAccount } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";

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

    // Create journal entry
    const expenseAccount = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        eq(chartAccount.code, "5100")
      ),
    });

    const bankAccount = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        eq(chartAccount.code, "1100")
      ),
    });

    let journalEntryId: string | null = null;

    if (expenseAccount && bankAccount) {
      const [maxResult] = await db
        .select({ max: sql<number>`coalesce(max(${journalEntry.entryNumber}), 0)` })
        .from(journalEntry)
        .where(eq(journalEntry.organizationId, ctx.organizationId));

      const entryNumber = (Number(maxResult?.max) || 0) + 1;

      const [entry] = await db
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

      journalEntryId = entry.id;

      await db.insert(journalLine).values([
        {
          journalEntryId: entry.id,
          accountId: expenseAccount.id,
          description: "Contractor expense",
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

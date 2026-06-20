import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenseClaim, chartAccount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { assertNotLocked } from "@/lib/api/period-lock";
import { createExpenseClaimPaymentJournalEntry } from "@/lib/api/expense-claims";
import { z } from "zod";

const paySchema = z.object({
  date: z.string().min(1),
  bankAccountCode: z.string().default("1100"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:expenses");

    const body = await request.json();
    const parsed = paySchema.parse(body);

    const found = await db.query.expenseClaim.findFirst({
      where: and(
        eq(expenseClaim.id, id),
        eq(expenseClaim.organizationId, ctx.organizationId),
        notDeleted(expenseClaim.deletedAt)
      ),
      with: {
        items: {
          with: { account: true },
        },
      },
    });

    if (!found) return notFound("Expense claim");
    if (found.status !== "approved") {
      return NextResponse.json(
        { error: "Only approved expense claims can be marked as paid" },
        { status: 400 }
      );
    }

    // Find bank account
    const bankAccount = await db.query.chartAccount.findFirst({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        eq(chartAccount.code, parsed.bankAccountCode)
      ),
    });

    if (!bankAccount) {
      return NextResponse.json(
        { error: "Bank account not found" },
        { status: 400 }
      );
    }

    // The payment posts a GL entry on parsed.date — block locked/closed periods.
    await assertNotLocked(ctx.organizationId, parsed.date, ctx);

    // Post the payment (DR Employee Reimbursements Payable / CR Bank) — clearing
    // the obligation recognized at approval — and flip status to paid atomically.
    // The expense accounts were already debited at approval, so we must NOT
    // re-debit them here.
    const paidAt = new Date();
    const updated = await db.transaction(async (tx) => {
      await createExpenseClaimPaymentJournalEntry(
        ctx,
        found,
        { id: bankAccount.id },
        tx,
        parsed.date
      );

      const [row] = await tx
        .update(expenseClaim)
        .set({
          status: "paid",
          paidAt,
          updatedAt: paidAt,
        })
        .where(eq(expenseClaim.id, id))
        .returning();
      return row;
    });

    logAudit({ ctx, action: "pay", entityType: "expense", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ expenseClaim: updated });
  } catch (err) {
    return handleError(err);
  }
}

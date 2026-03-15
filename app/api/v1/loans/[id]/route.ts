import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loan, loanSchedule } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["active", "paid_off", "defaulted"]).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.loan.findFirst({
      where: and(
        eq(loan.id, id),
        eq(loan.organizationId, ctx.organizationId),
        notDeleted(loan.deletedAt)
      ),
      with: {
        bankAccount: true,
        principalAccount: true,
        interestAccount: true,
      },
    });

    if (!found) return notFound("Loan");

    // Get schedule entries
    const schedule = await db.query.loanSchedule.findMany({
      where: eq(loanSchedule.loanId, id),
      orderBy: asc(loanSchedule.sortOrder),
    });

    return NextResponse.json({ loan: found, schedule });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const existing = await db.query.loan.findFirst({
      where: and(
        eq(loan.id, id),
        eq(loan.organizationId, ctx.organizationId),
        notDeleted(loan.deletedAt)
      ),
    });

    if (!existing) return notFound("Loan");

    const body = await request.json();
    const parsed = patchSchema.parse(body);

    const [updated] = await db
      .update(loan)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(loan.id, id))
      .returning();

    return NextResponse.json({ loan: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const existing = await db.query.loan.findFirst({
      where: and(
        eq(loan.id, id),
        eq(loan.organizationId, ctx.organizationId),
        notDeleted(loan.deletedAt)
      ),
    });

    if (!existing) return notFound("Loan");

    // Check if any payments have been posted
    const postedEntries = await db.query.loanSchedule.findFirst({
      where: and(
        eq(loanSchedule.loanId, id),
        eq(loanSchedule.posted, true)
      ),
    });

    if (postedEntries) {
      return validationError("Cannot delete a loan with posted payments");
    }

    // Delete schedule entries and soft-delete the loan
    await db.delete(loanSchedule).where(eq(loanSchedule.loanId, id));
    await db.update(loan).set(softDelete()).where(eq(loan.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "loan",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

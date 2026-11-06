import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledPayment, bill } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { z } from "zod";
import { checkPaymentBankAccount } from "@/lib/api/payment-bank-account";

const updateSchema = z.object({
  scheduledDate: z.string().optional(),
  amount: z.number().int().positive().optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["cancelled"]).optional(),
  // Change the bank account it will be paid from; null = the default bank
  // ledger account (1100).
  bankAccountId: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const existing = await db.query.scheduledPayment.findFirst({
      where: and(
        eq(scheduledPayment.id, id),
        eq(scheduledPayment.organizationId, ctx.organizationId),
        notDeleted(scheduledPayment.deletedAt)
      ),
    });

    if (!existing) return notFound("Scheduled payment");

    if (existing.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending scheduled payments can be updated" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    if (parsed.bankAccountId) {
      const scheduledBill = existing.billId
        ? await db.query.bill.findFirst({
            where: and(eq(bill.id, existing.billId), eq(bill.organizationId, ctx.organizationId)),
            columns: { currencyCode: true },
          })
        : null;
      const bankError = await checkPaymentBankAccount(
        ctx.organizationId,
        parsed.bankAccountId,
        [scheduledBill?.currencyCode ?? existing.currencyCode]
      );
      if (bankError) {
        return NextResponse.json({ error: bankError }, { status: 400 });
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.scheduledDate !== undefined)
      updates.scheduledDate = parsed.scheduledDate;
    if (parsed.amount !== undefined) updates.amount = parsed.amount;
    if (parsed.notes !== undefined) updates.notes = parsed.notes;
    if (parsed.bankAccountId !== undefined) updates.bankAccountId = parsed.bankAccountId;
    if (parsed.status === "cancelled") updates.status = "cancelled";

    await db
      .update(scheduledPayment)
      .set(updates)
      .where(eq(scheduledPayment.id, id));

    const result = await db.query.scheduledPayment.findFirst({
      where: eq(scheduledPayment.id, id),
      with: {
        bill: { with: { contact: true } },
        contact: true,
        bankAccount: { columns: { id: true, accountName: true, currencyCode: true } },
      },
    });

    logAudit({ ctx, action: "update", entityType: "scheduled_payment", entityId: id, changes: diffChanges(existing as Record<string, unknown>, result as Record<string, unknown>), request });

    return NextResponse.json({ scheduledPayment: result });
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
    requireRole(ctx, "manage:payments");

    const existing = await db.query.scheduledPayment.findFirst({
      where: and(
        eq(scheduledPayment.id, id),
        eq(scheduledPayment.organizationId, ctx.organizationId),
        notDeleted(scheduledPayment.deletedAt)
      ),
    });

    if (!existing) return notFound("Scheduled payment");

    await db
      .update(scheduledPayment)
      .set(softDelete())
      .where(eq(scheduledPayment.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "scheduled_payment",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { debitNote, bill } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const applySchema = z.object({
  billId: z.string().min(1),
  amount: z.number().int().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:debit-notes");

    const body = await request.json();
    const parsed = applySchema.parse(body);

    // Find the debit note
    const found = await db.query.debitNote.findFirst({
      where: and(
        eq(debitNote.id, id),
        eq(debitNote.organizationId, ctx.organizationId),
        notDeleted(debitNote.deletedAt)
      ),
    });

    if (!found) return notFound("Debit note");
    if (found.status !== "sent" && found.status !== "applied") {
      return NextResponse.json(
        { error: "Debit note must be sent before it can be applied" },
        { status: 400 }
      );
    }

    if (parsed.amount > found.amountRemaining) {
      return NextResponse.json(
        { error: "Amount exceeds remaining debit note balance" },
        { status: 400 }
      );
    }

    // Find the bill
    const foundBill = await db.query.bill.findFirst({
      where: and(
        eq(bill.id, parsed.billId),
        eq(bill.organizationId, ctx.organizationId),
        notDeleted(bill.deletedAt)
      ),
    });

    if (!foundBill) return notFound("Bill");

    // Update debit note
    const newAmountApplied = found.amountApplied + parsed.amount;
    const newAmountRemaining = found.total - newAmountApplied;
    const dnStatus = newAmountRemaining <= 0 ? "applied" : "sent";

    const [updatedDebitNote] = await db
      .update(debitNote)
      .set({
        amountApplied: newAmountApplied,
        amountRemaining: Math.max(0, newAmountRemaining),
        status: dnStatus as typeof debitNote.status.enumValues[number],
        updatedAt: new Date(),
      })
      .where(eq(debitNote.id, id))
      .returning();

    // Update bill
    const newBillAmountPaid = foundBill.amountPaid + parsed.amount;
    const newBillAmountDue = foundBill.total - newBillAmountPaid;
    const billStatus = newBillAmountDue <= 0 ? "paid" : "partial";

    const [updatedBill] = await db
      .update(bill)
      .set({
        amountPaid: newBillAmountPaid,
        amountDue: Math.max(0, newBillAmountDue),
        status: billStatus as typeof bill.status.enumValues[number],
        paidAt: billStatus === "paid" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(bill.id, parsed.billId))
      .returning();

    logAudit({ ctx, action: "apply", entityType: "debit_note", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ debitNote: updatedDebitNote, bill: updatedBill });
  } catch (err) {
    return handleError(err);
  }
}

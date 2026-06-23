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
    if (foundBill.status === "draft" || foundBill.status === "void") {
      return NextResponse.json(
        { error: "Cannot apply a credit to this bill status" },
        { status: 400 }
      );
    }
    // The debit note belongs to one supplier — applying it to another
    // supplier's bill would corrupt both suppliers' balances.
    if (foundBill.contactId !== found.contactId) {
      return NextResponse.json(
        { error: "This supplier credit belongs to a different supplier than the bill." },
        { status: 400 }
      );
    }
    // Amounts offset 1:1, so a currency mismatch would reduce the bill by the
    // wrong figure and break the tie between AP and the GL.
    if (foundBill.currencyCode !== found.currencyCode) {
      return NextResponse.json(
        { error: "The supplier credit and bill are in different currencies." },
        { status: 400 }
      );
    }
    if (parsed.amount > foundBill.amountDue) {
      return NextResponse.json(
        { error: "Amount exceeds the bill's outstanding balance" },
        { status: 400 }
      );
    }

    const newAmountApplied = found.amountApplied + parsed.amount;
    const newAmountRemaining = found.amountRemaining - parsed.amount;
    const dnStatus = newAmountRemaining <= 0 ? "applied" : "sent";

    // Settle against the bill's outstanding balance (amountDue), and do both
    // updates atomically so they can't drift apart on a failure.
    const newBillAmountPaid = foundBill.amountPaid + parsed.amount;
    const newBillAmountDue = foundBill.amountDue - parsed.amount;
    const billStatus = newBillAmountDue <= 0 ? "paid" : "partial";

    const { updatedDebitNote, updatedBill } = await db.transaction(async (tx) => {
      const [updatedDebitNote] = await tx
        .update(debitNote)
        .set({
          amountApplied: newAmountApplied,
          amountRemaining: Math.max(0, newAmountRemaining),
          status: dnStatus as typeof debitNote.status.enumValues[number],
          updatedAt: new Date(),
        })
        .where(eq(debitNote.id, id))
        .returning();

      const [updatedBill] = await tx
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

      return { updatedDebitNote, updatedBill };
    });

    logAudit({ ctx, action: "apply", entityType: "debit_note", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ debitNote: updatedDebitNote, bill: updatedBill });
  } catch (err) {
    return handleError(err);
  }
}

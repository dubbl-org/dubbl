import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bill } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { createPaymentJournalEntry } from "@/lib/api/journal-automation";
import { z } from "zod";

const paySchema = z.object({
  amount: z.number().int().min(1),
  date: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const body = await request.json();
    const parsed = paySchema.parse(body);

    const found = await db.query.bill.findFirst({
      where: and(
        eq(bill.id, id),
        eq(bill.organizationId, ctx.organizationId),
        notDeleted(bill.deletedAt)
      ),
    });

    if (!found) return notFound("Bill");
    if (found.status === "draft" || found.status === "void") {
      return NextResponse.json(
        { error: "Cannot record payment for this bill status" },
        { status: 400 }
      );
    }

    const newAmountPaid = found.amountPaid + parsed.amount;
    const newAmountDue = found.total - newAmountPaid;
    const newStatus = newAmountDue <= 0 ? "paid" : "partial";

    // Create payment journal entry
    await createPaymentJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        type: "bill",
        reference: found.billNumber,
        amount: parsed.amount,
        date: parsed.date,
      }
    );

    const [updated] = await db
      .update(bill)
      .set({
        amountPaid: newAmountPaid,
        amountDue: Math.max(0, newAmountDue),
        status: newStatus,
        paidAt: newStatus === "paid" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(bill.id, id))
      .returning();

    return NextResponse.json({ bill: updated });
  } catch (err) {
    return handleError(err);
  }
}

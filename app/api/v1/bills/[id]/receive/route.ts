import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bill } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { createBillJournalEntry } from "@/lib/api/journal-automation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:bills");

    const found = await db.query.bill.findFirst({
      where: and(
        eq(bill.id, id),
        eq(bill.organizationId, ctx.organizationId),
        notDeleted(bill.deletedAt)
      ),
      with: { lines: true },
    });

    if (!found) return notFound("Bill");
    if (found.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft bills can be received" },
        { status: 400 }
      );
    }

    // Create journal entry
    const entry = await createBillJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        billNumber: found.billNumber,
        total: found.total,
        taxTotal: found.taxTotal,
        lines: found.lines.map((l) => ({
          accountId: l.accountId,
          amount: l.amount,
          taxAmount: l.taxAmount,
        })),
        date: found.issueDate,
      }
    );

    const [updated] = await db
      .update(bill)
      .set({
        status: "received",
        receivedAt: new Date(),
        journalEntryId: entry?.id || null,
        updatedAt: new Date(),
      })
      .where(eq(bill.id, id))
      .returning();

    return NextResponse.json({ bill: updated });
  } catch (err) {
    return handleError(err);
  }
}

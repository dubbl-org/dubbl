import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bill } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import {
  createBillJournalEntry,
  mapBillLinesForPosting,
  recordBillStockReceipts,
  assertBaseRateAvailable,
} from "@/lib/api/journal-automation";
import { assertNotLocked } from "@/lib/api/period-lock";
import { postBillReceipt, ProcurementBlockedError } from "../../_procurement";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bills");

    const found = await db.query.bill.findFirst({
      where: and(
        eq(bill.id, id),
        eq(bill.organizationId, ctx.organizationId),
        notDeleted(bill.deletedAt)
      ),
      with: { lines: true },
    });

    if (!found) return notFound("Bill");
    if (found.status !== "pending_approval") {
      return NextResponse.json(
        { error: "Only bills pending approval can be approved" },
        { status: 400 }
      );
    }

    // Pre-flight guards before any posting/side effects: the posting date must
    // not fall in a locked period, and a foreign-currency bill must have a base
    // rate on its issue date (fail cleanly as 422 with no partial writes).
    await assertNotLocked(ctx.organizationId, found.issueDate, ctx);
    await assertBaseRateAvailable(ctx.organizationId, found.currencyCode, found.issueDate);

    // Post the bill: main entry (unmatched lines + full tax → AP) plus, for any
    // line linked to a goods receipt / PO line, clear GRNI (DR 2150) and book
    // purchase price variance (5050). Enforces three-way-match tolerances —
    // a hard violation throws ProcurementBlockedError (422 below).
    const { entryId, grniEntryId, warnings } = await postBillReceipt(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        billNumber: found.billNumber,
        issueDate: found.issueDate,
        currencyCode: found.currencyCode,
        taxTotal: found.taxTotal,
        total: found.total,
        lines: found.lines.map((l) => ({
          id: l.id,
          description: l.description,
          amount: l.amount,
          quantity: l.quantity,
          accountId: l.accountId,
          inventoryItemId: l.inventoryItemId,
          warehouseId: l.warehouseId,
          goodsReceiptLineId: l.goodsReceiptLineId,
          taxRateId: l.taxRateId,
          taxAmount: l.taxAmount,
        })),
      },
      { createBillJournalEntry, mapBillLinesForPosting, recordBillStockReceipts }
    );

    const [updated] = await db
      .update(bill)
      .set({
        status: "received",
        approvedBy: ctx.userId,
        approvedAt: new Date(),
        journalEntryId: entryId || null,
        updatedAt: new Date(),
      })
      .where(eq(bill.id, id))
      .returning();

    logAudit({ ctx, action: "approve", entityType: "bill", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ bill: updated, grniEntryId, warnings });
  } catch (err) {
    if (err instanceof ProcurementBlockedError) {
      return NextResponse.json({ error: err.message, issues: err.issues }, { status: 422 });
    }
    return handleError(err);
  }
}

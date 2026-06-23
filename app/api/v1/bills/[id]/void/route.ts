import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bill, billLine, inventoryItem } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { assertNotLocked } from "@/lib/api/period-lock";
import { reverseJournalEntry } from "@/lib/api/journal-automation";
import { recordInventoryIssue, type ValuedItem } from "@/lib/api/inventory-valuation";

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
    });

    if (!found) return notFound("Bill");
    if (found.status === "void") {
      return NextResponse.json({ error: "Already voided" }, { status: 400 });
    }
    // A bill with payments against it can't be voided — that would reverse the
    // expense/AP/VAT while leaving the cash already paid stranded. Unapply or
    // refund the payment first, then void.
    if (found.amountPaid > 0) {
      return validationError(
        "Cannot void a bill with recorded payments. Unapply or refund the payment first, then void."
      );
    }

    // A bill posts to the GL (expense/inventory, input VAT, AP) and receives
    // stock only once it leaves draft and a journalEntryId is stamped. A draft
    // never posted, so voiding it is a pure status flip.
    const wasPosted = !!found.journalEntryId;
    if (wasPosted) {
      await assertNotLocked(ctx.organizationId, found.issueDate, ctx);
    }

    const lines = wasPosted
      ? await db.query.billLine.findMany({ where: eq(billLine.billId, id) })
      : [];
    const stockLines = lines.filter((l) => l.inventoryItemId);

    const [updated] = await db.transaction(async (tx) => {
      // Reverse the bill's GL impact (DR Expense/Inventory, DR Input VAT, CR AP)
      // by mirroring the original posted entry with debit/credit swapped.
      if (wasPosted && found.journalEntryId) {
        await reverseJournalEntry(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          {
            entryId: found.journalEntryId,
            date: found.issueDate,
            description: `Void bill ${found.billNumber}`,
            reference: found.billNumber,
            sourceType: "bill_void",
            sourceId: found.id,
          },
          tx
        );
      }

      // Reverse the perpetual stock RECEIPT for each stock line (reduce on-hand
      // qty + value). The GL inventory value was already reversed by the entry
      // above, so this only moves the quantity ledger — no extra GL posting.
      for (const line of stockLines) {
        const units = Math.round(line.quantity / 100);
        if (units <= 0 || !line.inventoryItemId) continue;
        const item = await tx.query.inventoryItem.findFirst({
          where: and(
            eq(inventoryItem.id, line.inventoryItemId),
            eq(inventoryItem.organizationId, ctx.organizationId)
          ),
        });
        if (!item) continue;
        await recordInventoryIssue(tx, {
          item: item as ValuedItem,
          quantity: units,
          warehouseId: line.warehouseId,
          type: "adjustment",
          referenceType: "bill_void",
          referenceId: found.id,
          createdBy: ctx.userId,
        });
      }

      return tx
        .update(bill)
        .set({
          status: "void",
          voidedAt: new Date(),
          amountDue: 0,
          updatedAt: new Date(),
        })
        .where(eq(bill.id, id))
        .returning();
    });

    logAudit({ ctx, action: "void", entityType: "bill", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ bill: updated });
  } catch (err) {
    return handleError(err);
  }
}

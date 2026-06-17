import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesReceipt, journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { assertNotLocked } from "@/lib/api/period-lock";
import { getNextEntryNumber, createCogsJournalEntry } from "@/lib/api/journal-automation";

/**
 * Void a sales receipt.
 *
 * For a draft (never posted) this is a pure status flip. For a posted receipt
 * we reverse the GL impact rather than mutate history: a mirror journal entry
 * is posted that swaps debit/credit on every original line (linked back via
 * reversesEntryId / reversedByEntryId), and any inventory relieved by the sale
 * is restocked via createCogsJournalEntry({reverse:true}). All atomic.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:invoices");

    const found = await db.query.salesReceipt.findFirst({
      where: and(
        eq(salesReceipt.id, id),
        eq(salesReceipt.organizationId, ctx.organizationId),
        notDeleted(salesReceipt.deletedAt)
      ),
      with: { lines: true },
    });

    if (!found) return notFound("Sales receipt");
    if (found.status === "void") {
      return validationError("Already voided");
    }

    // Use today for the reversal-posting date guard when posted; a draft has no
    // GL impact to reverse but we still guard its own date.
    await assertNotLocked(ctx.organizationId, found.date);

    const updated = await db.transaction(async (tx) => {
      // Reverse the GL entry if the receipt was posted.
      if (found.journalEntryId) {
        const original = await tx.query.journalEntry.findFirst({
          where: and(
            eq(journalEntry.id, found.journalEntryId),
            eq(journalEntry.organizationId, ctx.organizationId)
          ),
          with: { lines: true },
        });

        if (original && !original.reversedByEntryId) {
          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const [reversal] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: found.date,
              description: `Void sales receipt ${found.receiptNumber}`,
              reference: found.receiptNumber,
              status: "posted",
              sourceType: "sales_receipt_void",
              sourceId: found.id,
              reversesEntryId: original.id,
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();

          if (original.lines.length > 0) {
            await tx.insert(journalLine).values(
              original.lines.map((l) => ({
                journalEntryId: reversal.id,
                accountId: l.accountId,
                description: `Void sales receipt ${found.receiptNumber}`,
                debitAmount: l.creditAmount,
                creditAmount: l.debitAmount,
                currencyCode: l.currencyCode,
                exchangeRate: l.exchangeRate,
                costCenterId: l.costCenterId,
                projectId: l.projectId,
              }))
            );
          }

          await tx
            .update(journalEntry)
            .set({ reversedByEntryId: reversal.id, updatedAt: new Date() })
            .where(eq(journalEntry.id, original.id));
        }

        // Restock any inventory that the sale relieved.
        const stockLines = found.lines.filter((l) => l.inventoryItemId);
        if (stockLines.length > 0) {
          await createCogsJournalEntry(
            { organizationId: ctx.organizationId, userId: ctx.userId },
            {
              reference: found.receiptNumber,
              date: found.date,
              currencyCode: found.currencyCode,
              lines: stockLines.map((l) => ({
                inventoryItemId: l.inventoryItemId as string,
                quantity: l.quantity,
                warehouseId: l.warehouseId,
              })),
            },
            tx,
            { reverse: true }
          );
        }
      }

      const [row] = await tx
        .update(salesReceipt)
        .set({
          status: "void",
          voidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(salesReceipt.id, id))
        .returning();

      return row;
    });

    logAudit({
      ctx,
      action: "void",
      entityType: "sales_receipt",
      entityId: id,
      changes: { previousStatus: found.status },
      request,
    });

    return NextResponse.json({ salesReceipt: updated });
  } catch (err) {
    return handleError(err);
  }
}

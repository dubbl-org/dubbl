import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { assertNotLocked } from "@/lib/api/period-lock";
import { getNextEntryNumber, createCogsJournalEntry } from "@/lib/api/journal-automation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:invoices");

    const found = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
      with: { lines: true },
    });

    if (!found) return notFound("Invoice");
    if (found.status === "void") {
      return NextResponse.json({ error: "Already voided" }, { status: 400 });
    }

    // Block the void if the invoice has any settlement against it — recorded
    // payments OR applied credit notes both increment amountPaid. Voiding here
    // would restock the FULL quantity and reverse the full revenue/AR while
    // leaving the cash already received (or the credit note's AR relief) stranded
    // — cash/AR and the open-item ledger would no longer tie out. The user must
    // first unapply/refund the settlement, then void.
    if (found.amountPaid > 0) {
      return validationError(
        "Cannot void an invoice with recorded payments or applied credit notes. Unapply or refund the settlement first, then void."
      );
    }

    // An invoice only posts to the GL (revenue/AR) and relieves inventory (COGS)
    // when it is SENT — status moves to sent/partial/paid and a journalEntryId is
    // stamped. A draft never posted, so voiding it is a pure status flip: no GL
    // reversal, no restock. Otherwise the unconditional COGS reverse would CREATE
    // phantom inventory (restocking stock that was never issued) and post a
    // dangling DR Inventory / CR COGS entry.
    const wasPosted =
      ["sent", "partial", "paid"].includes(found.status) || !!found.journalEntryId;

    // Don't let a void post reversing entries into a locked/closed period.
    if (wasPosted) {
      await assertNotLocked(ctx.organizationId, found.issueDate, ctx);
    }

    const stockLines = wasPosted ? found.lines.filter((l) => l.inventoryItemId) : [];

    const [updated] = await db.transaction(async (tx) => {
      // Reverse the original sale's GL impact (DR Revenue, DR Output VAT, CR AR)
      // by mirroring the original posted entry's lines with debit/credit swapped.
      if (wasPosted && found.journalEntryId) {
        const originalLines = await tx.query.journalLine.findMany({
          where: eq(journalLine.journalEntryId, found.journalEntryId),
        });
        if (originalLines.length > 0) {
          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const [reversal] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: found.issueDate,
              description: `Void invoice ${found.invoiceNumber}`,
              reference: found.invoiceNumber,
              status: "posted",
              sourceType: "invoice_void",
              sourceId: found.id,
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();

          await tx.insert(journalLine).values(
            originalLines.map((l) => ({
              journalEntryId: reversal.id,
              accountId: l.accountId,
              description: `Void invoice ${found.invoiceNumber}`,
              debitAmount: l.creditAmount,
              creditAmount: l.debitAmount,
              currencyCode: l.currencyCode,
              exchangeRate: l.exchangeRate,
              costCenterId: l.costCenterId,
              projectId: l.projectId,
            }))
          );
        }
      }

      // Restock + reverse COGS for any stock lines (DR Inventory / CR COGS).
      if (stockLines.length > 0) {
        await createCogsJournalEntry(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          {
            reference: found.invoiceNumber,
            date: found.issueDate,
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

      return tx
        .update(invoice)
        .set({
          status: "void",
          voidedAt: new Date(),
          amountDue: 0,
          updatedAt: new Date(),
        })
        .where(eq(invoice.id, id))
        .returning();
    });

    logAudit({ ctx, action: "void", entityType: "invoice", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ invoice: updated });
  } catch (err) {
    return handleError(err);
  }
}

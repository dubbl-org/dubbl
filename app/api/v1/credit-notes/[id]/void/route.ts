import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  creditNote,
  invoice,
  journalEntry,
  journalLine,
  payment,
  paymentAllocation,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { assertNotLocked } from "@/lib/api/period-lock";
import { getNextEntryNumber, createCogsJournalEntry } from "@/lib/api/journal-automation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:credit-notes");

    const found = await db.query.creditNote.findFirst({
      where: and(
        eq(creditNote.id, id),
        eq(creditNote.organizationId, ctx.organizationId),
        notDeleted(creditNote.deletedAt)
      ),
    });

    if (!found) return notFound("Credit note");
    if (found.status === "void") {
      return NextResponse.json({ error: "Already voided" }, { status: 400 });
    }

    // A credit note only posts to the GL when it is SENT (status sent/applied
    // and a journalEntryId is stamped). A draft never posted, so voiding it is a
    // pure status flip — no reversal, no restock undo.
    const wasPosted =
      (found.status === "sent" || found.status === "applied") &&
      !!found.journalEntryId;

    // Don't let a void post reversing entries into a locked/closed period.
    if (wasPosted) {
      await assertNotLocked(ctx.organizationId, found.issueDate, ctx);
    }

    const [updated] = await db.transaction(async (tx) => {
      if (wasPosted) {
        // 1) Reverse the issue posting. The send route booked
        //    DR Revenue / DR Output VAT / CR Accounts Receivable.
        //    Mirror those posted lines with debit/credit swapped so the pair
        //    nets to zero in base currency (DR AR / CR Revenue / CR Output VAT).
        const originalLines = await tx.query.journalLine.findMany({
          where: eq(journalLine.journalEntryId, found.journalEntryId as string),
        });
        if (originalLines.length > 0) {
          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const [reversal] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: found.issueDate,
              description: `Void credit note ${found.creditNoteNumber}`,
              reference: found.creditNoteNumber,
              status: "posted",
              sourceType: "credit_note_void",
              sourceId: found.id,
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();

          await tx.insert(journalLine).values(
            originalLines.map((l) => ({
              journalEntryId: reversal.id,
              accountId: l.accountId,
              description: `Void credit note ${found.creditNoteNumber}`,
              debitAmount: l.creditAmount,
              creditAmount: l.debitAmount,
              currencyCode: l.currencyCode,
              exchangeRate: l.exchangeRate,
              costCenterId: l.costCenterId,
              projectId: l.projectId,
            }))
          );
        }

        // 2) Undo the restock the SEND performed. Sending a credit note for a
        //    linked invoice RESTOCKED the credited stock (reverse COGS:
        //    DR Inventory / CR COGS). Voiding the credit note must take that
        //    stock back out — i.e. RE-ISSUE it (DR COGS / CR Inventory) for the
        //    same credited fraction. We call createCogsJournalEntry WITHOUT
        //    reverse, mirroring exactly the send route's fraction logic so the
        //    quantities line up.
        if (found.invoiceId) {
          const original = await tx.query.invoice.findFirst({
            where: and(
              eq(invoice.id, found.invoiceId),
              eq(invoice.organizationId, ctx.organizationId)
            ),
            with: { lines: true },
          });
          const invStockLines = original?.lines.filter((l) => l.inventoryItemId) ?? [];
          if (original && invStockLines.length > 0) {
            const fraction =
              original.total > 0 ? Math.min(found.total / original.total, 1) : 1;
            const reissueLines = invStockLines
              .map((l) => ({
                inventoryItemId: l.inventoryItemId as string,
                quantity: Math.round(l.quantity * fraction),
                warehouseId: l.warehouseId,
              }))
              .filter((l) => l.quantity > 0);
            if (reissueLines.length > 0) {
              await createCogsJournalEntry(
                { organizationId: ctx.organizationId, userId: ctx.userId },
                {
                  reference: found.creditNoteNumber,
                  date: found.issueDate,
                  currencyCode: found.currencyCode,
                  lines: reissueLines,
                },
                tx
                // no { reverse } → re-issue stock, undoing the send's restock
              );
            }
          }
        }
      }

      // 3) Reverse any OPEN-ITEM application of this credit note. The apply
      //    route (credit-notes/[id]/apply) does NOT post a journal entry — it
      //    relieved AR once at issue — so applying it only: inserted a carrier
      //    `payment` row with two paymentAllocation rows (a `credit_note`
      //    allocation pointing to this note + an `invoice` allocation pointing
      //    to the settled invoice) and decremented the target invoice's
      //    amountDue / bumped amountPaid. Voiding must UNWIND that so balances
      //    tie out: restore every affected invoice's amountPaid/amountDue/status
      //    and remove the carrier payment(s) + their allocations. We key off the
      //    allocations (not amountApplied alone) so multiple partial
      //    applications across different invoices are all reversed.
      const cnAllocations = await tx.query.paymentAllocation.findMany({
        where: and(
          eq(paymentAllocation.documentType, "credit_note"),
          eq(paymentAllocation.documentId, id)
        ),
      });

      if (cnAllocations.length > 0) {
        const carrierPaymentIds = [
          ...new Set(cnAllocations.map((a) => a.paymentId)),
        ];

        // The invoice-side allocations carried by the same payments tell us how
        // much to give back to each invoice.
        const invoiceAllocations = await tx.query.paymentAllocation.findMany({
          where: and(
            inArray(paymentAllocation.paymentId, carrierPaymentIds),
            eq(paymentAllocation.documentType, "invoice")
          ),
        });

        // Sum the credit applied per invoice across all carrier payments.
        const appliedByInvoice = new Map<string, number>();
        for (const a of invoiceAllocations) {
          appliedByInvoice.set(
            a.documentId,
            (appliedByInvoice.get(a.documentId) ?? 0) + a.amount
          );
        }

        for (const [invoiceId, applied] of appliedByInvoice) {
          if (applied <= 0) continue;
          const target = await tx.query.invoice.findFirst({
            where: and(
              eq(invoice.id, invoiceId),
              eq(invoice.organizationId, ctx.organizationId)
            ),
          });
          if (!target) continue;
          // Voided invoices were settled to zero; don't resurrect their balance.
          if (target.status === "void") continue;

          const restoredPaid = Math.max(0, target.amountPaid - applied);
          const restoredDue = target.total - restoredPaid;
          // If this credit note was the ONLY settlement, removing it leaves the
          // invoice with nothing paid, so it returns to 'sent' (not 'partial').
          const restoredStatus =
            restoredPaid <= 0 ? "sent" : restoredDue <= 0 ? "paid" : "partial";

          await tx
            .update(invoice)
            .set({
              amountPaid: restoredPaid,
              amountDue: Math.max(0, restoredDue),
              status: restoredStatus,
              paidAt: restoredStatus === "paid" ? target.paidAt : null,
              updatedAt: new Date(),
            })
            .where(eq(invoice.id, invoiceId));
        }

        // Remove the carrier payment(s); paymentAllocation rows cascade off
        // payment, so the credit_note + invoice allocations go with them.
        await tx
          .delete(payment)
          .where(
            and(
              inArray(payment.id, carrierPaymentIds),
              eq(payment.organizationId, ctx.organizationId)
            )
          );
      }

      return tx
        .update(creditNote)
        .set({
          status: "void",
          voidedAt: new Date(),
          // Voiding releases all applied credit: reset the open balance so the
          // note doesn't appear half-applied after the carriers are gone.
          amountApplied: 0,
          amountRemaining: found.total,
          updatedAt: new Date(),
        })
        .where(eq(creditNote.id, id))
        .returning();
    });

    logAudit({ ctx, action: "void", entityType: "credit_note", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ creditNote: updated });
  } catch (err) {
    return handleError(err);
  }
}

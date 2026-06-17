import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankTransaction, bankAccount, payment, paymentAllocation, invoice, bill, journalEntry, auditLog } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:banking");

    // Find the transaction and verify ownership through bank account
    const transaction = await db.query.bankTransaction.findFirst({
      where: eq(bankTransaction.id, id),
      with: { bankAccount: true },
    });

    if (!transaction) return notFound("Bank transaction");

    // Verify the bank account belongs to this organization
    const account = await db.query.bankAccount.findFirst({
      where: and(
        eq(bankAccount.id, transaction.bankAccountId),
        eq(bankAccount.organizationId, ctx.organizationId),
        notDeleted(bankAccount.deletedAt)
      ),
    });

    if (!account) return notFound("Bank transaction");

    if (transaction.status !== "reconciled") {
      return NextResponse.json(
        { error: "Transaction is not reconciled" },
        { status: 400 }
      );
    }

    // Check if there's a linked payment
    const linkedPayment = await db.query.payment.findFirst({
      where: and(
        eq(payment.bankTransactionId, id),
        notDeleted(payment.deletedAt)
      ),
      with: { allocations: true },
    });

    const { updated } = await db.transaction(async (tx) => {
        let linkedPaymentId: string | null = null;
        let reversedAllocations = 0;
        let voidedJournalEntryId: string | null = null;
        let unwoundTransferLegId: string | null = null;
        let deletedTransferMirror = false;

        // ------------------------------------------------------------------
        // Transfer-aware unwind. A transfer match posts ONE shared journal
        // entry referenced by BOTH legs and pairs them via
        // transferTransactionId. Unreconciling one leg must unwind the other
        // too, or the counter leg is left status='reconciled' pointing at a
        // now-voided JE. We void the shared JE exactly once here (so the
        // payment/categorization branches below don't double-void it), reset
        // or delete the counter leg, and clear the transfer pairing fields on
        // this line.
        // ------------------------------------------------------------------
        if (transaction.transferTransactionId) {
          const counter = await tx.query.bankTransaction.findFirst({
            where: eq(bankTransaction.id, transaction.transferTransactionId),
          });

          // Void the shared journal entry exactly once.
          if (transaction.journalEntryId) {
            await tx
              .update(journalEntry)
              .set({
                status: "void",
                voidedAt: new Date(),
                voidReason: "Bank transfer unreconciled",
                deletedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(journalEntry.id, transaction.journalEntryId),
                  eq(journalEntry.organizationId, ctx.organizationId)
                )
              );
            voidedJournalEntryId = transaction.journalEntryId;
          }

          if (counter) {
            // An AUTO-CREATED mirror (made by the match itself) has
            // sourceType 'transfer' and no statement origin (no importId) — it
            // never existed before the transfer, so delete it. A real
            // statement line that was matched is reset back to unreconciled.
            const isAutoMirror =
              counter.sourceType === "transfer" && counter.importId === null;
            if (isAutoMirror) {
              await tx
                .delete(bankTransaction)
                .where(eq(bankTransaction.id, counter.id));
              deletedTransferMirror = true;
            } else {
              await tx
                .update(bankTransaction)
                .set({
                  status: "unreconciled",
                  journalEntryId: null,
                  transferTransactionId: null,
                  transferGroupId: null,
                })
                .where(eq(bankTransaction.id, counter.id));
            }
            unwoundTransferLegId = counter.id;
          }
        }

        if (linkedPayment) {
          linkedPaymentId = linkedPayment.id;

          // Reverse allocations on bills and invoices
          for (const allocation of linkedPayment.allocations) {
            if (allocation.documentType === "bill") {
              const existingBill = await tx.query.bill.findFirst({
                where: eq(bill.id, allocation.documentId),
              });

              if (existingBill) {
                const newAmountPaid = existingBill.amountPaid - allocation.amount;
                const newAmountDue = existingBill.amountDue + allocation.amount;
                const newStatus = newAmountPaid > 0 ? "partial" : "received";

                await tx
                  .update(bill)
                  .set({
                    amountPaid: newAmountPaid,
                    amountDue: newAmountDue,
                    status: newStatus,
                    paidAt: null,
                    updatedAt: new Date(),
                  })
                  .where(eq(bill.id, allocation.documentId));
              }
            } else if (allocation.documentType === "invoice") {
              const existingInvoice = await tx.query.invoice.findFirst({
                where: eq(invoice.id, allocation.documentId),
              });

              if (existingInvoice) {
                const newAmountPaid =
                  existingInvoice.amountPaid - allocation.amount;
                const newAmountDue =
                  existingInvoice.amountDue + allocation.amount;
                const newStatus = newAmountPaid > 0 ? "partial" : "sent";

                await tx
                  .update(invoice)
                  .set({
                    amountPaid: newAmountPaid,
                    amountDue: newAmountDue,
                    status: newStatus,
                    paidAt: null,
                    updatedAt: new Date(),
                  })
                  .where(eq(invoice.id, allocation.documentId));
              }
            }

            reversedAllocations++;
          }

          // Delete payment allocations
          if (linkedPayment.allocations.length > 0) {
            await tx
              .delete(paymentAllocation)
              .where(eq(paymentAllocation.paymentId, linkedPayment.id));
          }

          // Soft-delete the linked journal entry if present
          if (linkedPayment.journalEntryId) {
            await tx
              .update(journalEntry)
              .set({
                status: "void",
                deletedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(journalEntry.id, linkedPayment.journalEntryId));
          }

          // Soft-delete the payment
          await tx
            .update(payment)
            .set({
              deletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(payment.id, linkedPayment.id));
        } else if (transaction.journalEntryId && !transaction.transferTransactionId) {
          // No linked payment, but the line was categorized/split-to-account:
          // void that categorization journal entry in the SAME tx so the GL is
          // no longer overstated and the trial balance ties back to the bank.
          // (Transfer JEs are already voided above, so skip when paired.)
          await tx
            .update(journalEntry)
            .set({
              status: "void",
              voidedAt: new Date(),
              voidReason: "Bank transaction unreconciled",
              deletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(journalEntry.id, transaction.journalEntryId),
                eq(journalEntry.organizationId, ctx.organizationId)
              )
            );
          voidedJournalEntryId = transaction.journalEntryId;
        }

        // Reset the transaction (clear transfer pairing too, if any).
        const [updated] = await tx
          .update(bankTransaction)
          .set({
            status: "unreconciled",
            reconciliationId: null,
            journalEntryId: null,
            transferTransactionId: null,
            transferGroupId: null,
          })
          .where(eq(bankTransaction.id, id))
          .returning();

        // Log to audit log
        await tx.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "unreconciled",
          entityType: "bank_transaction",
          entityId: id,
          changes: {
            previousStatus: "reconciled",
            paymentId: linkedPaymentId,
            reversedAllocations,
            voidedJournalEntryId,
            unwoundTransferLegId,
            deletedTransferMirror,
          },
        });

        return { updated };
      });

    return NextResponse.json({ transaction: updated });
  } catch (err) {
    return handleError(err);
  }
}

import { db } from "@/lib/db";
import { invoice, journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { assertNotLocked } from "@/lib/api/period-lock";
import { getNextEntryNumber, createCogsJournalEntry } from "@/lib/api/journal-automation";
import { hasActiveRevenueSchedule } from "@/lib/api/revenue-schedules";
import type { AuthContext } from "@/lib/api/auth-context";

/** The invoice can't be voided (not found, already void, settled, schedule running). */
export class InvoiceVoidError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "InvoiceVoidError";
  }
}

/**
 * Void an invoice: reverse its sale entry (revenue, output tax, AR) and
 * restock any stock lines (reversing COGS), then mark it void, all in one
 * transaction. Drafts never posted, so they are a status flip. Refuses
 * invoices with payments or applied credits, or a revenue schedule in
 * progress. Shared by the REST void route and the MCP void_invoice tool.
 */
export async function voidInvoice(ctx: AuthContext, invoiceId: string) {
  const found = await db.query.invoice.findFirst({
    where: and(
      eq(invoice.id, invoiceId),
      eq(invoice.organizationId, ctx.organizationId),
      notDeleted(invoice.deletedAt)
    ),
    with: { lines: true },
  });

  if (!found) throw new InvoiceVoidError("Invoice not found", 404);
  if (found.status === "void") {
    throw new InvoiceVoidError("Already voided");
  }

  // Block the void if the invoice has any settlement against it — recorded
  // payments OR applied credit notes both increment amountPaid. Voiding here
  // would restock the FULL quantity and reverse the full revenue/AR while
  // leaving the cash already received (or the credit note's AR relief) stranded
  // — cash/AR and the open-item ledger would no longer tie out. The user must
  // first unapply/refund the settlement, then void.
  if (found.amountPaid > 0) {
    throw new InvoiceVoidError(
      "Cannot void an invoice with recorded payments or applied credit notes. Unapply or refund the settlement first, then void."
    );
  }

  // A schedule in progress holds part of this invoice's income in deferred
  // revenue; cancelling it first returns that income so the void reverses
  // the right amounts.
  if (await hasActiveRevenueSchedule(ctx.organizationId, invoiceId)) {
    throw new InvoiceVoidError(
      "This invoice has a revenue schedule in progress. Cancel the schedule first, then void."
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
      .where(eq(invoice.id, invoiceId))
      .returning();
  });

  return { invoice: updated, previousStatus: found.status };
}

import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { assertNotLocked, PeriodLockedError } from "@/lib/api/period-lock";
import { MissingExchangeRateError } from "@/lib/currency/converter";
import { createInvoiceJournalEntry, createCogsJournalEntry, assertBaseRateAvailable } from "@/lib/api/journal-automation";
import { buildSenderSnapshot, buildRecipientSnapshot } from "@/lib/documents/snapshots";
import type { AuthContext } from "@/lib/api/auth-context";

/** The invoice can't be sent (not found, not a draft). */
export class InvoiceSendError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "InvoiceSendError";
  }
}

/** Load a draft invoice that is about to be sent, or throw InvoiceSendError. */
export async function loadDraftForSending(ctx: AuthContext, invoiceId: string) {
  const found = await db.query.invoice.findFirst({
    where: and(
      eq(invoice.id, invoiceId),
      eq(invoice.organizationId, ctx.organizationId),
      notDeleted(invoice.deletedAt)
    ),
    with: { lines: true, contact: true },
  });
  if (!found) throw new InvoiceSendError("Invoice not found", 404);
  if (found.status !== "draft") throw new InvoiceSendError("Only draft invoices can be sent");
  // A line with no income account would post nothing (no income, no
  // receivable), so refuse instead of posting an empty or partial entry.
  const unposted = found.lines.find((l) => !l.accountId && l.amount !== 0);
  if (unposted) {
    throw new InvoiceSendError(
      `The line "${unposted.description.slice(0, 60)}" has no income account. Pick an account on the invoice, then send it.`
    );
  }
  // Checked before any email goes out: the invoice posts on its issue date,
  // which must be open, and a foreign-currency invoice needs a rate.
  await assertNotLocked(ctx.organizationId, found.issueDate, ctx);
  await assertBaseRateAvailable(ctx.organizationId, found.currencyCode, found.issueDate);
  return found;
}

/**
 * Send (issue) a draft invoice without emailing it: post the sale (DR Accounts
 * Receivable / CR income and output tax), relieve stock and post cost of
 * goods sold for stock lines, snapshot the sender and recipient, and mark it
 * sent, all in one transaction. Shared by the send route, bulk "mark as sent"
 * and the MCP tools so a sent invoice always has its ledger entry.
 */
export async function postDraftInvoice(ctx: AuthContext, invoiceId: string) {
  const found = await loadDraftForSending(ctx, invoiceId);

  const senderSnapshot = await buildSenderSnapshot(ctx.organizationId);
  const recipientSnapshot = found.contact
    ? buildRecipientSnapshot(found.contact)
    : { name: "Unknown", email: null, address: null, taxNumber: null };

  const stockLines = found.lines.filter((l) => l.inventoryItemId);

  return db.transaction(async (tx) => {
    // Claim the draft first so two sends at once can't post twice.
    const [claimed] = await tx
      .update(invoice)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(and(eq(invoice.id, found.id), eq(invoice.status, "draft")))
      .returning({ id: invoice.id });
    if (!claimed) throw new InvoiceSendError("Only draft invoices can be sent");

    const entry = await createInvoiceJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        invoiceNumber: found.invoiceNumber,
        total: found.total,
        taxTotal: found.taxTotal,
        subtotal: found.subtotal,
        lines: found.lines.map((l) => ({
          accountId: l.accountId,
          amount: l.amount,
          taxAmount: l.taxAmount,
          taxRateId: l.taxRateId,
        })),
        date: found.issueDate,
        currencyCode: found.currencyCode,
      },
      tx
    );

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
        tx
      );
    }

    const [row] = await tx
      .update(invoice)
      .set({
        journalEntryId: entry?.id || null,
        senderSnapshot,
        recipientSnapshot,
        updatedAt: new Date(),
      })
      .where(eq(invoice.id, found.id))
      .returning();
    return { invoice: row, previousStatus: found.status };
  });
}

/**
 * Send several drafts without emailing them (postDraftInvoice for each). Each
 * is done on its own, so one that can't be sent (not a draft, locked period,
 * missing FX rate) is reported and the rest still go.
 */
export async function postDraftInvoices(ctx: AuthContext, ids: string[]) {
  const results: { id: string; success: boolean; error?: string }[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      await postDraftInvoice(ctx, id);
      results.push({ id, success: true });
    } catch (err) {
      const known = err instanceof InvoiceSendError || err instanceof PeriodLockedError || err instanceof MissingExchangeRateError;
      if (!known) console.error(`Failed to send invoice ${id}:`, err);
      results.push({ id, success: false, error: known ? (err as Error).message : "Couldn't send this invoice" });
    }
  }
  return results;
}

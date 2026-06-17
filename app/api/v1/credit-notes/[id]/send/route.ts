import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creditNote, invoice, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { createCreditNoteJournalEntry, createCogsJournalEntry } from "@/lib/api/journal-automation";
import { assertNotLocked } from "@/lib/api/period-lock";
import { sendDocumentEmail } from "@/lib/email/document-sender";
import { renderDocumentEmailHtml } from "@/lib/email/render-document-email";
import { z } from "zod";

const templatePropsSchema = z.object({
  organizationName: z.string(),
  contactName: z.string(),
  documentType: z.string(),
  documentNumber: z.string(),
  personalMessage: z.string().optional(),
  amountFormatted: z.string().optional(),
  dueDateFormatted: z.string().optional(),
  issueDateFormatted: z.string().optional(),
  viewUrl: z.string().optional(),
  buttonLabel: z.string().optional(),
});

const sendBodySchema = z.object({
  sendEmail: z.literal(true),
  recipientEmail: z.string().email(),
  subject: z.string().min(1),
  templateProps: templatePropsSchema,
  attachPdf: z.boolean().default(false),
});

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
      with: { lines: true },
    });

    if (!found) return notFound("Credit note");
    if (found.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft credit notes can be sent" },
        { status: 400 }
      );
    }

    const rawBody = await request.json().catch(() => ({}));
    const emailParsed = sendBodySchema.safeParse(rawBody);

    if (emailParsed.success) {
      const { recipientEmail, subject, templateProps } = emailParsed.data;
      const html = await renderDocumentEmailHtml(templateProps);
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
      });

      await sendDocumentEmail({
        orgId: ctx.organizationId,
        userId: ctx.userId,
        documentType: "credit_note",
        documentId: id,
        recipientEmail,
        subject,
        body: html,
        attachPdf: false,
        replyTo: org?.contactEmail || undefined,
      });
    }

    await assertNotLocked(ctx.organizationId, found.issueDate);

    // Cost of goods sold reversal: a sales return restores inventory and reverses
    // COGS for the stock that comes back. Credit-note lines don't carry inventory
    // dimensions, so we read the stock lines from the original invoice (when the
    // credit note is linked to one) and restock proportionally to the credited
    // fraction (full credit → full restock; partial → pro-rata by value). This is
    // a read — done before the transaction; the restock POSTING happens inside it.
    let restockLines: {
      inventoryItemId: string;
      quantity: number;
      warehouseId: string | null;
    }[] = [];
    if (found.invoiceId) {
      const original = await db.query.invoice.findFirst({
        where: and(
          eq(invoice.id, found.invoiceId),
          eq(invoice.organizationId, ctx.organizationId)
        ),
        with: { lines: true },
      });
      const invStockLines = original?.lines.filter((l) => l.inventoryItemId) ?? [];
      if (original && invStockLines.length > 0) {
        // Credited fraction of the original invoice, capped at 1 (a credit note
        // can't return more stock than was sold). Falls back to full restock if
        // the original total is zero/unknown.
        const fraction =
          original.total > 0 ? Math.min(found.total / original.total, 1) : 1;
        restockLines = invStockLines
          .map((l) => ({
            inventoryItemId: l.inventoryItemId as string,
            quantity: Math.round(l.quantity * fraction),
            warehouseId: l.warehouseId,
          }))
          .filter((l) => l.quantity > 0);
      }
    }

    // Post the reversal JE + COGS restock + the status/journalEntryId update in
    // ONE transaction so a mid-post failure can't leave an orphaned journal
    // entry, a sent credit note with no GL, or restocked inventory without a
    // posted reversal.
    const updated = await db.transaction(async (tx) => {
      // Create journal entry: DR Revenue, DR Output VAT, CR Accounts Receivable —
      // reversing the original sale's revenue + output VAT.
      const entry = await createCreditNoteJournalEntry(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        {
          creditNoteNumber: found.creditNoteNumber,
          total: found.total,
          taxTotal: found.taxTotal,
          lines: found.lines.map((l) => ({
            accountId: l.accountId,
            amount: l.amount,
            taxAmount: l.taxAmount,
          })),
          date: found.issueDate,
          currencyCode: found.currencyCode,
        },
        tx
      );

      if (restockLines.length > 0) {
        await createCogsJournalEntry(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          {
            reference: found.creditNoteNumber,
            date: found.issueDate,
            currencyCode: found.currencyCode,
            lines: restockLines,
          },
          tx,
          { reverse: true }
        );
      }

      const [row] = await tx
        .update(creditNote)
        .set({
          status: "sent",
          sentAt: new Date(),
          amountRemaining: found.total,
          journalEntryId: entry?.id || null,
          updatedAt: new Date(),
        })
        .where(eq(creditNote.id, id))
        .returning();
      return row;
    });

    logAudit({ ctx, action: "send", entityType: "credit_note", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ creditNote: updated });
  } catch (err) {
    return handleError(err);
  }
}

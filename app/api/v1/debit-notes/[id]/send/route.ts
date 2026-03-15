import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { debitNote, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { createDebitNoteJournalEntry } from "@/lib/api/journal-automation";
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
    requireRole(ctx, "manage:debit-notes");

    const found = await db.query.debitNote.findFirst({
      where: and(
        eq(debitNote.id, id),
        eq(debitNote.organizationId, ctx.organizationId),
        notDeleted(debitNote.deletedAt)
      ),
      with: { lines: true },
    });

    if (!found) return notFound("Debit note");
    if (found.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft debit notes can be sent" },
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
        documentType: "debit_note",
        documentId: id,
        recipientEmail,
        subject,
        body: html,
        attachPdf: false,
        replyTo: org?.contactEmail || undefined,
      });
    }

    await assertNotLocked(ctx.organizationId, found.issueDate);

    // Create journal entry
    const entry = await createDebitNoteJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        debitNoteNumber: found.debitNoteNumber,
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
      .update(debitNote)
      .set({
        status: "sent",
        sentAt: new Date(),
        amountRemaining: found.total,
        journalEntryId: entry?.id || null,
        updatedAt: new Date(),
      })
      .where(eq(debitNote.id, id))
      .returning();

    logAudit({ ctx, action: "send", entityType: "debit_note", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ debitNote: updated });
  } catch (err) {
    return handleError(err);
  }
}

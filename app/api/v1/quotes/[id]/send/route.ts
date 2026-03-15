import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { quote, organization, portalAccessToken } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { sendDocumentEmail } from "@/lib/email/document-sender";
import { renderDocumentEmailHtml } from "@/lib/email/render-document-email";
import { randomBytes } from "crypto";
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
    requireRole(ctx, "manage:invoices");

    const found = await db.query.quote.findFirst({
      where: and(
        eq(quote.id, id),
        eq(quote.organizationId, ctx.organizationId),
        notDeleted(quote.deletedAt)
      ),
    });

    if (!found) return notFound("Quote");
    if (found.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft quotes can be sent" },
        { status: 400 }
      );
    }

    const rawBody = await request.json().catch(() => ({}));
    const emailParsed = sendBodySchema.safeParse(rawBody);

    if (emailParsed.success) {
      const { recipientEmail, subject, templateProps } = emailParsed.data;

      // Generate portal access URL for the quote
      if (found.contactId) {
        let token = await db.query.portalAccessToken.findFirst({
          where: and(
            eq(portalAccessToken.organizationId, ctx.organizationId),
            eq(portalAccessToken.contactId, found.contactId),
            isNull(portalAccessToken.revokedAt),
          ),
        });
        if (!token) {
          const [created] = await db
            .insert(portalAccessToken)
            .values({
              organizationId: ctx.organizationId,
              contactId: found.contactId,
              token: randomBytes(32).toString("hex"),
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            })
            .returning();
          token = created;
        }
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        templateProps.viewUrl = `${APP_URL}/portal/${token.token}/quotes`;
        templateProps.buttonLabel = "View quote";
      }

      const html = await renderDocumentEmailHtml(templateProps);
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
      });

      await sendDocumentEmail({
        orgId: ctx.organizationId,
        userId: ctx.userId,
        documentType: "quote",
        documentId: id,
        recipientEmail,
        subject,
        body: html,
        attachPdf: false,
        replyTo: org?.contactEmail || undefined,
      });
    }

    const [updated] = await db
      .update(quote)
      .set({
        status: "sent",
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(quote.id, id))
      .returning();

    logAudit({ ctx, action: "send", entityType: "quote", entityId: id, changes: { previousStatus: found.status }, request });

    return NextResponse.json({ quote: updated });
  } catch (err) {
    return handleError(err);
  }
}

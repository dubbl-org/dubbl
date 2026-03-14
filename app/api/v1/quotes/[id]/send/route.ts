import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { quote, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { sendDocumentEmail } from "@/lib/email/document-sender";
import { z } from "zod";

const sendBodySchema = z.object({
  sendEmail: z.literal(true),
  recipientEmail: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
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
      const { recipientEmail, subject, body } = emailParsed.data;
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
        body,
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

    return NextResponse.json({ quote: updated });
  } catch (err) {
    return handleError(err);
  }
}

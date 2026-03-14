import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creditNote, organization } from "@/lib/db/schema";
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
    requireRole(ctx, "manage:credit-notes");

    const found = await db.query.creditNote.findFirst({
      where: and(
        eq(creditNote.id, id),
        eq(creditNote.organizationId, ctx.organizationId),
        notDeleted(creditNote.deletedAt)
      ),
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
      const { recipientEmail, subject, body } = emailParsed.data;
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
        body,
        attachPdf: false,
        replyTo: org?.contactEmail || undefined,
      });
    }

    const [updated] = await db
      .update(creditNote)
      .set({
        status: "sent",
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creditNote.id, id))
      .returning();

    return NextResponse.json({ creditNote: updated });
  } catch (err) {
    return handleError(err);
  }
}

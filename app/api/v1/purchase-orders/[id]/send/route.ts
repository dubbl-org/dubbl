import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { purchaseOrder, organization } from "@/lib/db/schema";
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
    requireRole(ctx, "approve:bills");

    const found = await db.query.purchaseOrder.findFirst({
      where: and(
        eq(purchaseOrder.id, id),
        eq(purchaseOrder.organizationId, ctx.organizationId),
        notDeleted(purchaseOrder.deletedAt)
      ),
    });

    if (!found) return notFound("Purchase order");
    if (found.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft purchase orders can be sent" },
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
        documentType: "purchase_order",
        documentId: id,
        recipientEmail,
        subject,
        body,
        attachPdf: false,
        replyTo: org?.contactEmail || undefined,
      });
    }

    const [updated] = await db
      .update(purchaseOrder)
      .set({
        status: "sent",
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrder.id, id))
      .returning();

    return NextResponse.json({ purchaseOrder: updated });
  } catch (err) {
    return handleError(err);
  }
}

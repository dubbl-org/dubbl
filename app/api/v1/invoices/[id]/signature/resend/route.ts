import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, invoiceSignature, emailConfig } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { sendEmail } from "@/lib/email/smtp-client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const inv = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!inv) return notFound("Invoice");

    // Find the most recent pending signature request
    const sig = await db.query.invoiceSignature.findFirst({
      where: and(
        eq(invoiceSignature.invoiceId, id),
        eq(invoiceSignature.status, "pending")
      ),
    });

    if (!sig) {
      return NextResponse.json(
        { error: "No pending signature request found for this invoice" },
        { status: 404 }
      );
    }

    const emailCfg = await db.query.emailConfig.findFirst({
      where: eq(emailConfig.organizationId, ctx.organizationId),
    });

    if (!emailCfg) {
      return NextResponse.json(
        { error: "Email is not configured for this organization" },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const signUrl = `${url.protocol}//${url.host}/sign/${sig.token}`;

    await sendEmail(emailCfg, {
      to: sig.signerEmail,
      subject: `Reminder: Signature requested - Invoice ${inv.invoiceNumber}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Signature Reminder</h2>
          <p>Hello ${sig.signerName},</p>
          <p>This is a reminder that you have been asked to sign invoice <strong>${inv.invoiceNumber}</strong>.</p>
          <p>
            <a href="${signUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
              Review & Sign
            </a>
          </p>
          ${sig.expiresAt ? `<p style="color: #6b7280; font-size: 14px;">This link expires on ${new Date(sig.expiresAt).toLocaleDateString()}.</p>` : ""}
          <p style="color: #6b7280; font-size: 14px;">If you did not expect this request, you can safely ignore this email.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, invoiceSignature, emailConfig } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { sendEmail } from "@/lib/email/smtp-client";
import { randomBytes } from "crypto";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const body = await request.json();
    const { signerName, signerEmail, expiresAt } = body;

    if (!signerName || !signerEmail) {
      return NextResponse.json(
        { error: "signerName and signerEmail are required" },
        { status: 400 }
      );
    }

    const inv = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!inv) return notFound("Invoice");

    const token = randomBytes(32).toString("base64url");

    const [sig] = await db
      .insert(invoiceSignature)
      .values({
        invoiceId: id,
        token,
        signerName,
        signerEmail,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })
      .returning();

    // Send signing email
    const emailCfg = await db.query.emailConfig.findFirst({
      where: eq(emailConfig.organizationId, ctx.organizationId),
    });

    if (emailCfg) {
      const url = new URL(request.url);
      const signUrl = `${url.protocol}//${url.host}/sign/${token}`;

      await sendEmail(emailCfg, {
        to: signerEmail,
        subject: `Signature requested - Invoice ${inv.invoiceNumber}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Signature Request</h2>
            <p>Hello ${signerName},</p>
            <p>You have been asked to sign invoice <strong>${inv.invoiceNumber}</strong>.</p>
            <p>
              <a href="${signUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
                Review & Sign
              </a>
            </p>
            ${expiresAt ? `<p style="color: #6b7280; font-size: 14px;">This link expires on ${new Date(expiresAt).toLocaleDateString()}.</p>` : ""}
            <p style="color: #6b7280; font-size: 14px;">If you did not expect this request, you can safely ignore this email.</p>
          </div>
        `,
      });
    }

    return NextResponse.json({ signature: sig }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    // Verify invoice belongs to org
    const inv = await db.query.invoice.findFirst({
      where: and(
        eq(invoice.id, id),
        eq(invoice.organizationId, ctx.organizationId),
        notDeleted(invoice.deletedAt)
      ),
    });

    if (!inv) return notFound("Invoice");

    const signatures = await db.query.invoiceSignature.findMany({
      where: eq(invoiceSignature.invoiceId, id),
    });

    return NextResponse.json({ signatures });
  } catch (err) {
    return handleError(err);
  }
}

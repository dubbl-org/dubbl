import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, error } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { formatMoney } from "@/lib/money";
import { sendDocumentEmail } from "@/lib/email/document-sender";
import {
  buildBatchRemittance,
  resolveBatchPaymentDate,
  type RemittanceGroup,
} from "@/lib/api/remittance";
import { z } from "zod";

/**
 * Remittance advice for a payment batch.
 *
 * A payment batch holds one item per (bill, supplier) being paid. This route
 * groups those items by supplier (contact) and produces a remittance advice
 * listing which of their bills were paid and the amount applied to each. Money
 * amounts are integer cents throughout.
 *
 * GET  -> returns the structured remittance data (one group per supplier).
 * POST -> renders + emails a remittance advice to each supplier with an email
 *         (or only to the contact named in the body, if `contactId` is given).
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const result = await buildBatchRemittance(ctx.organizationId, id);
    if (!result) return notFound("Payment batch");

    return NextResponse.json({
      batch: {
        id: result.batch.id,
        name: result.batch.name,
        status: result.batch.status,
        totalAmount: result.batch.totalAmount,
        paymentCount: result.batch.paymentCount,
        submittedAt: result.batch.submittedAt,
        completedAt: result.batch.completedAt,
      },
      remittances: result.groups,
    });
  } catch (err) {
    return handleError(err);
  }
}

const sendBodySchema = z.object({
  // When provided, only email the remittance for this one supplier; otherwise
  // every supplier in the batch with an email is sent their remittance.
  contactId: z.string().optional(),
  personalMessage: z.string().optional(),
});

function renderRemittanceHtml(
  orgName: string,
  group: RemittanceGroup,
  batchName: string,
  paymentDate: string,
  personalMessage?: string
): string {
  const formatDate = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  const fmt = (cents: number) => formatMoney(cents, group.currencyCode);

  const rows = group.lines
    .map(
      (l) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">${formatDate(l.billDate)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">${l.billNumber}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;">${l.billReference || "-"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;font-family:monospace;">${fmt(l.billTotal)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;font-family:monospace;">${fmt(l.amountPaid)}</td>
      </tr>`
    )
    .join("\n");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;padding:0;margin:0;">
  <div style="max-width:700px;margin:0 auto;padding:32px 20px;">
    <h1 style="font-size:20px;font-weight:700;margin:0 0 4px;">Remittance Advice</h1>
    <p style="font-size:13px;color:#666;margin:0 0 24px;">${orgName}</p>

    <table style="width:100%;margin-bottom:16px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:13px;"><strong>${group.contactName}</strong></td>
        <td style="font-size:12px;text-align:right;color:#666;">Payment date: ${formatDate(paymentDate)}</td>
      </tr>
    </table>

    ${
      personalMessage
        ? `<p style="font-size:13px;color:#525f7f;line-height:22px;margin:0 0 24px;white-space:pre-wrap;">${personalMessage}</p>`
        : ""
    }

    <p style="font-size:13px;color:#444;margin:0 0 16px;">
      The following bills have been paid${batchName ? ` (batch: ${batchName})` : ""}:
    </p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;" cellpadding="0" cellspacing="0">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Bill Date</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Bill #</th>
          <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Reference</th>
          <th style="padding:8px;text-align:right;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Bill Total</th>
          <th style="padding:8px;text-align:right;font-size:10px;text-transform:uppercase;color:#888;font-weight:500;border-bottom:1px solid #ddd;">Amount Paid</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr style="background:#f9f9f9;">
          <td colspan="4" style="padding:8px;font-size:12px;font-weight:600;border-bottom:1px solid #ddd;">Total Paid</td>
          <td style="padding:8px;font-size:12px;font-weight:600;text-align:right;font-family:monospace;border-bottom:1px solid #ddd;">${fmt(group.totalPaid)}</td>
        </tr>
      </tbody>
    </table>

    <p style="font-size:11px;color:#999;margin-top:24px;">
      This remittance advice was generated by ${orgName}.
    </p>
  </div>
</body>
</html>`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const result = await buildBatchRemittance(ctx.organizationId, id);
    if (!result) return notFound("Payment batch");

    const rawBody = await request.json().catch(() => ({}));
    const parsed = sendBodySchema.parse(rawBody);

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });
    const orgName = org?.name || "Organization";

    const paymentDate = resolveBatchPaymentDate(result.batch);

    let groups = result.groups;
    if (parsed.contactId) {
      groups = groups.filter((g) => g.contactId === parsed.contactId);
      if (!groups.length) {
        return error(
          "No remittance found for the given contact in this batch",
          404
        );
      }
    }

    const sent: Array<{ contactId: string; recipientEmail: string }> = [];
    const skipped: Array<{ contactId: string; reason: string }> = [];

    for (const group of groups) {
      if (!group.contactEmail) {
        skipped.push({
          contactId: group.contactId,
          reason: "Supplier has no email address",
        });
        continue;
      }

      const html = renderRemittanceHtml(
        orgName,
        group,
        result.batch.name,
        paymentDate,
        parsed.personalMessage
      );

      await sendDocumentEmail({
        orgId: ctx.organizationId,
        userId: ctx.userId,
        documentType: "remittance_advice",
        documentId: id,
        recipientEmail: group.contactEmail,
        subject: `Remittance advice from ${orgName} — ${formatMoney(group.totalPaid, group.currencyCode)}`,
        body: html,
        attachPdf: false,
        replyTo: org?.contactEmail || undefined,
      });

      sent.push({
        contactId: group.contactId,
        recipientEmail: group.contactEmail,
      });
    }

    logAudit({
      ctx,
      action: "send_remittance",
      entityType: "payment_batch",
      entityId: id,
      changes: { sentCount: sent.length, skippedCount: skipped.length },
      request,
    });

    return NextResponse.json({ success: true, sent, skipped });
  } catch (err) {
    return handleError(err);
  }
}

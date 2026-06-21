import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, emailConfig, organization, reminderLog } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getAuthContext, type AuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { sendEmail } from "@/lib/email/smtp-client";
import { renderTemplate } from "@/lib/email/template-engine";
import { logAudit } from "@/lib/api/audit";
import { formatMoney } from "@/lib/money";
import { z } from "zod";
import { POST as sendInvoice } from "../[id]/send/route";

const bulkSchema = z.object({
  action: z.enum(["send-reminder", "mark-as-sent"]),
  invoiceIds: z.array(z.string().min(1)).min(1).max(200),
});

// A per-invoice result so the UI can show a row-by-row summary.
type ResultStatus = "sent" | "skipped" | "failed";
interface BulkResult {
  invoiceId: string;
  status: ResultStatus;
  message?: string;
}

// Default reminder copy used when the org has no reminder rule template. Kept
// plain and customer-facing (end users aren't accountants).
const DEFAULT_SUBJECT = "Reminder: invoice {{documentNumber}} from {{organizationName}}";
const DEFAULT_BODY =
  "<p>Hi {{contactName}},</p>" +
  "<p>This is a friendly reminder that invoice <strong>{{documentNumber}}</strong> " +
  "for <strong>{{amountDue}}</strong> was due on {{dueDate}}.</p>" +
  "<p>If you've already paid, please ignore this message. Thank you!</p>" +
  "<p>{{organizationName}}</p>";

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const { action, invoiceIds } = bulkSchema.parse(body);

    // De-dupe ids while preserving order.
    const ids = [...new Set(invoiceIds)];

    if (action === "send-reminder") {
      return await handleSendReminder(ctx, ids, request);
    }
    return await handleMarkAsSent(ctx, ids, request);
  } catch (err) {
    return handleError(err);
  }
}

async function handleSendReminder(
  ctx: AuthContext,
  ids: string[],
  request: Request
): Promise<NextResponse> {
  // Sending reminders is an email/recurring concern — same permission the
  // reminder rules + processor use.
  requireRole(ctx, "manage:recurring");

  // SMTP must be configured + verified or nothing can go out.
  const config = await db.query.emailConfig.findFirst({
    where: eq(emailConfig.organizationId, ctx.organizationId),
  });
  if (!config || !config.isVerified) {
    return NextResponse.json(
      { error: "Email is not set up yet. Connect and verify your email to send reminders." },
      { status: 400 }
    );
  }

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, ctx.organizationId),
  });

  // Org-scoped load of just the requested invoices, with the contact for the
  // recipient email + name.
  const invoices = await db.query.invoice.findMany({
    where: and(
      eq(invoice.organizationId, ctx.organizationId),
      inArray(invoice.id, ids),
      notDeleted(invoice.deletedAt)
    ),
    with: { contact: true },
  });
  const byId = new Map(invoices.map((i) => [i.id, i]));

  const results: BulkResult[] = [];
  let sent = 0;

  // Reuse the same email primitives the reminder processor uses, but targeted
  // at the explicit invoice ids the user selected. One email per invoice, in a
  // loop, so a single failure never aborts the batch.
  for (const id of ids) {
    const inv = byId.get(id);
    if (!inv) {
      results.push({ invoiceId: id, status: "skipped", message: "Not found" });
      continue;
    }
    // Reminders only make sense for invoices that are owed money.
    if (inv.status === "draft" || inv.status === "void" || inv.status === "paid") {
      results.push({ invoiceId: id, status: "skipped", message: "Nothing owed on this invoice" });
      continue;
    }
    const recipient = inv.contact?.email;
    if (!recipient) {
      results.push({ invoiceId: id, status: "skipped", message: "Customer has no email" });
      continue;
    }

    const dueDate = new Date(inv.dueDate);
    const diffDays = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const vars = {
      contactName: inv.contact?.name || "",
      documentNumber: inv.invoiceNumber,
      amountDue: formatMoney(inv.amountDue, inv.currencyCode),
      dueDate: inv.dueDate,
      organizationName: org?.name || "",
      daysOverdue: String(Math.max(0, diffDays)),
    };
    const subject = renderTemplate(DEFAULT_SUBJECT, vars);
    const html = renderTemplate(DEFAULT_BODY, vars);

    try {
      await sendEmail(config, { to: recipient, subject, html });
      await db.insert(reminderLog).values({
        organizationId: ctx.organizationId,
        reminderRuleId: null,
        documentType: "invoice",
        documentId: inv.id,
        recipientEmail: recipient,
        subject,
        status: "sent",
      });
      // Track escalation: bump this invoice's dunning stage by one per
      // successfully-sent reminder. Org-scoped so we never touch another org's row.
      await db
        .update(invoice)
        .set({ dunningLevel: sql`${invoice.dunningLevel} + 1` })
        .where(
          and(eq(invoice.id, inv.id), eq(invoice.organizationId, ctx.organizationId))
        );
      results.push({ invoiceId: id, status: "sent", message: `Sent to ${recipient}` });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Send failed";
      await db.insert(reminderLog).values({
        organizationId: ctx.organizationId,
        reminderRuleId: null,
        documentType: "invoice",
        documentId: inv.id,
        recipientEmail: recipient,
        subject,
        status: "failed",
        errorMessage: message,
      });
      results.push({ invoiceId: id, status: "failed", message });
    }
  }

  logAudit({
    ctx,
    action: "bulk-send-reminder",
    entityType: "invoice",
    entityId: ids.join(","),
    changes: { requested: ids.length, sent },
    request,
  });

  return NextResponse.json({ action: "send-reminder", results, summary: summarize(results) });
}

async function handleMarkAsSent(
  ctx: AuthContext,
  ids: string[],
  request: Request
): Promise<NextResponse> {
  requireRole(ctx, "approve:invoices");

  const results: BulkResult[] = [];

  // Reuse the existing per-invoice send route handler so the GL posting,
  // COGS, snapshots and status update all stay in one place. We forward the
  // org context via the same x-organization-id header and call it per id with
  // an empty body (no email) so it just marks the draft as sent + posts.
  // Always use the AUTHENTICATED org — never trust the raw request header.
  const orgId = ctx.organizationId;
  for (const id of ids) {
    try {
      const subReq = new Request(`http://internal/api/v1/invoices/${id}/send`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-organization-id": orgId,
          cookie: request.headers.get("cookie") || "",
          authorization: request.headers.get("authorization") || "",
        },
        body: "{}",
      });
      const res = await sendInvoice(subReq, { params: Promise.resolve({ id }) });
      if (res.ok) {
        results.push({ invoiceId: id, status: "sent" });
      } else {
        const data = await res.json().catch(() => ({}));
        const message: string = data?.error || `Failed (${res.status})`;
        // A non-draft invoice isn't an error worth failing the row over —
        // surface it as skipped so partial selections behave sensibly.
        const status: ResultStatus = res.status === 400 ? "skipped" : "failed";
        results.push({ invoiceId: id, status, message });
      }
    } catch (err) {
      results.push({
        invoiceId: id,
        status: "failed",
        message: err instanceof Error ? err.message : "Failed",
      });
    }
  }

  logAudit({
    ctx,
    action: "bulk-mark-as-sent",
    entityType: "invoice",
    entityId: ids.join(","),
    changes: { requested: ids.length, sent: results.filter((r) => r.status === "sent").length },
    request,
  });
  return NextResponse.json({ action: "mark-as-sent", results, summary: summarize(results) });
}

function summarize(results: BulkResult[]) {
  return {
    total: results.length,
    sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
  };
}

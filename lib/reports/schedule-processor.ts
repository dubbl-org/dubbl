import { db } from "@/lib/db";
import { reportSchedule, emailConfig, organization } from "@/lib/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { sendEmail } from "@/lib/email/smtp-client";
import { sendPlatformEmail } from "@/lib/email/resend-client";
import { documentsFromAddress } from "@/lib/email/senders";
import { checkEmailLimit } from "@/lib/api/check-limit";
import { notifySafely, notifySystemAlert } from "@/lib/notifications/events";
import { runSavedReportConfig } from "@/lib/reports/saved-report-data";
import { savedReportFile } from "@/lib/reports/saved-report-file";
import type { ReportConfig } from "@/lib/db/schema/reports";

import { calculateNextRunAt } from "@/lib/reports/schedule-timing";
import { getCurrencyMinorUnits } from "@/lib/currency/iso4217";

/**
 * How scheduled report emails go out for an org: through its own mail server
 * when it's set up and verified, otherwise through dubbl's shared sender (like
 * invoice emails and payment reminders), with replies going to the
 * organization's contact email.
 */
async function reportMailer(orgId: string) {
  const [config, org] = await Promise.all([
    db.query.emailConfig.findFirst({ where: eq(emailConfig.organizationId, orgId) }),
    db.query.organization.findFirst({ where: eq(organization.id, orgId), columns: { contactEmail: true } }),
  ]);
  const smtp = config?.isVerified ? config : null;
  return async (message: {
    to: string;
    subject: string;
    html: string;
    attachments: { filename: string; content: Buffer }[];
  }) => {
    if (smtp) {
      await sendEmail(smtp, message);
      return;
    }
    await checkEmailLimit(orgId);
    await sendPlatformEmail({
      ...message,
      from: documentsFromAddress(),
      replyTo: org?.contactEmail || undefined,
    });
  };
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Build the scheduled report: run the saved report for real, attach it in the
 * schedule's format (PDF, CSV or XLSX) and put a short preview of the first
 * rows in the email body.
 */
async function buildScheduledReport(
  organizationId: string,
  reportName: string,
  config: ReportConfig,
  format: "pdf" | "csv" | "xlsx",
  intro: string,
  now: Date
) {
  const result = await runSavedReportConfig(organizationId, config);
  const file = await savedReportFile(reportName, result, format);
  const preview = result.rows.slice(0, 10);
  const fmt = (row: (typeof preview)[number], col: string, v: unknown) => {
    if (v === null || v === undefined) return "";
    if (result.moneyColumns.includes(col)) {
      // Money is in minor units of the row's currency (else the org base currency).
      const n = Number(v);
      const code = typeof row.currencyCode === "string" && row.currencyCode ? row.currencyCode : result.currency;
      const digits = getCurrencyMinorUnits(code);
      return Number.isFinite(n) ? (n / Math.pow(10, digits)).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "";
    }
    return String(v instanceof Date ? v.toISOString().slice(0, 10) : v);
  };
  const th = result.columns
    .map((c) => `<th style="text-align:left;padding:4px 8px;border-bottom:1px solid #ddd;">${escapeHtml(c)}</th>`)
    .join("");
  const trs = preview
    .map(
      (r) =>
        `<tr>${result.columns
          .map((c) => `<td style="padding:4px 8px;border-bottom:1px solid #f0f0f0;">${escapeHtml(fmt(r, c, r[c]))}</td>`)
          .join("")}</tr>`
    )
    .join("");
  const html = [
    `<h2>${escapeHtml(reportName)}</h2>`,
    `<p>${escapeHtml(intro)} The full report (${result.rows.length} rows) is attached as ${format.toUpperCase()}.</p>`,
    preview.length > 0
      ? `<table style="border-collapse:collapse;font-size:13px;"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`
      : "<p>The report has no rows for this run.</p>",
    result.rows.length > preview.length ? `<p style="color:#888;">Showing the first ${preview.length} rows.</p>` : "",
    `<p style="color:#888;font-size:12px;">Generated at ${now.toISOString()}</p>`,
  ].join("\n");
  return { html, attachments: [{ filename: file.filename, content: file.content }] };
}

/**
 * Process all due report schedules.
 * Fetches schedules where nextRunAt <= now, generates report data,
 * sends via org SMTP, and updates run metadata.
 */
export async function processReportSchedules() {
  const now = new Date();
  let sent = 0;
  let failed = 0;

  const dueSchedules = await db.query.reportSchedule.findMany({
    where: and(
      eq(reportSchedule.isActive, true),
      notDeleted(reportSchedule.deletedAt),
      lte(reportSchedule.nextRunAt, now)
    ),
    with: {
      savedReport: true,
    },
  });

  for (const schedule of dueSchedules) {
    try {
      if (!schedule.savedReport) {
        throw new Error(`Saved report not found for schedule ${schedule.id}`);
      }

      // Fetch the org's SMTP config
      const send = await reportMailer(schedule.organizationId);

      // Run the report and attach it in the chosen format
      const email = await buildScheduledReport(
        schedule.organizationId,
        schedule.savedReport.name,
        schedule.savedReport.config,
        schedule.format,
        `Your ${schedule.frequency} report is ready.`,
        now
      );

      // Send to each recipient
      const recipients = schedule.recipients ?? [];
      for (const recipient of recipients) {
        await send({
          to: recipient,
          subject: `Scheduled report: ${schedule.savedReport.name}`,
          html: email.html,
          attachments: email.attachments,
        });
      }

      // Update schedule metadata
      const nextRunAt = calculateNextRunAt(schedule.frequency, now);
      await db
        .update(reportSchedule)
        .set({
          lastRunAt: now,
          lastRunStatus: "success",
          nextRunAt,
          updatedAt: now,
        })
        .where(eq(reportSchedule.id, schedule.id));

      sent++;
    } catch (err) {
      console.error(`Report schedule ${schedule.id} failed:`, err);

      await db
        .update(reportSchedule)
        .set({
          lastRunAt: now,
          lastRunStatus: `failed: ${err instanceof Error ? err.message : "unknown error"}`,
          updatedAt: now,
        })
        .where(eq(reportSchedule.id, schedule.id));

      await notifySafely(
        notifySystemAlert(schedule.organizationId, {
          title: `Scheduled report "${schedule.savedReport?.name ?? "Report"}" wasn't sent`,
          body: err instanceof Error ? err.message : undefined,
        })
      );

      failed++;
    }
  }

  return { processed: dueSchedules.length, sent, failed };
}

/**
 * Process a single report schedule immediately by ID.
 */
export async function processReportScheduleById(scheduleId: string, organizationId: string) {
  const now = new Date();

  const schedule = await db.query.reportSchedule.findFirst({
    where: and(
      eq(reportSchedule.id, scheduleId),
      eq(reportSchedule.organizationId, organizationId),
      notDeleted(reportSchedule.deletedAt)
    ),
    with: { savedReport: true },
  });

  if (!schedule) {
    throw new Error("Report schedule not found");
  }

  if (!schedule.savedReport) {
    throw new Error("Saved report not found");
  }

  const send = await reportMailer(schedule.organizationId);

  const email = await buildScheduledReport(
    schedule.organizationId,
    schedule.savedReport.name,
    schedule.savedReport.config,
    schedule.format,
    `Here is your ${schedule.frequency} report, sent now on request.`,
    now
  );

  const recipients = schedule.recipients ?? [];
  for (const recipient of recipients) {
    await send({
      to: recipient,
      subject: `Scheduled report: ${schedule.savedReport.name}`,
      html: email.html,
      attachments: email.attachments,
    });
  }

  const nextRunAt = calculateNextRunAt(schedule.frequency, now);
  await db
    .update(reportSchedule)
    .set({
      lastRunAt: now,
      lastRunStatus: "success",
      nextRunAt,
      updatedAt: now,
    })
    .where(eq(reportSchedule.id, schedule.id));

  return { sent: recipients.length };
}

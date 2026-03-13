import { db } from "@/lib/db";
import { reportSchedule, emailConfig } from "@/lib/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { sendEmail } from "@/lib/email/smtp-client";

/**
 * Calculate the next run time based on frequency.
 */
function calculateNextRunAt(
  frequency: "daily" | "weekly" | "monthly" | "quarterly",
  from: Date
): Date {
  const next = new Date(from);
  switch (frequency) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      break;
  }
  return next;
}

/**
 * Generate simple CSV content from a saved report config.
 */
function generateReportCsv(
  reportName: string,
  config: { columns: string[]; dataSource: string }
): string {
  const header = config.columns.join(",");
  const meta = `# Report: ${reportName}`;
  const source = `# Data source: ${config.dataSource}`;
  const generated = `# Generated: ${new Date().toISOString()}`;
  return [meta, source, generated, "", header].join("\n");
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
      const smtp = await db.query.emailConfig.findFirst({
        where: eq(emailConfig.organizationId, schedule.organizationId),
      });

      if (!smtp) {
        throw new Error(
          `No email config found for organization ${schedule.organizationId}`
        );
      }

      // Generate report content
      const csvContent = generateReportCsv(
        schedule.savedReport.name,
        schedule.savedReport.config
      );

      // Send to each recipient
      const recipients = schedule.recipients ?? [];
      for (const recipient of recipients) {
        await sendEmail(smtp, {
          to: recipient,
          subject: `Scheduled Report: ${schedule.savedReport.name}`,
          html: [
            `<h2>Scheduled Report: ${schedule.savedReport.name}</h2>`,
            `<p>Your scheduled ${schedule.frequency} report is ready.</p>`,
            `<p>Format: ${schedule.format}</p>`,
            `<pre>${csvContent}</pre>`,
            `<p style="color:#888;font-size:12px;">Generated at ${now.toISOString()}</p>`,
          ].join("\n"),
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

  const smtp = await db.query.emailConfig.findFirst({
    where: eq(emailConfig.organizationId, schedule.organizationId),
  });

  if (!smtp) {
    throw new Error("No email config found for organization");
  }

  const csvContent = generateReportCsv(
    schedule.savedReport.name,
    schedule.savedReport.config
  );

  const recipients = schedule.recipients ?? [];
  for (const recipient of recipients) {
    await sendEmail(smtp, {
      to: recipient,
      subject: `Scheduled Report: ${schedule.savedReport.name}`,
      html: [
        `<h2>Scheduled Report: ${schedule.savedReport.name}</h2>`,
        `<p>Your ${schedule.frequency} report has been triggered manually.</p>`,
        `<p>Format: ${schedule.format}</p>`,
        `<pre>${csvContent}</pre>`,
        `<p style="color:#888;font-size:12px;">Generated at ${now.toISOString()}</p>`,
      ].join("\n"),
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

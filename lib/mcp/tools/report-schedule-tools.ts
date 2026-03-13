/**
 * MCP tools for report schedules.
 * These tools should be added inside the registerReportTools function in reports.ts,
 * or registered separately via a new registerReportScheduleTools function.
 *
 * Add the following import to reports.ts:
 *   import { reportSchedule, savedReport } from "@/lib/db/schema";
 *   import { desc, sql } from "drizzle-orm";
 *   import { notDeleted, softDelete } from "@/lib/db/soft-delete";
 *   import { processReportScheduleById } from "@/lib/reports/schedule-processor";
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { reportSchedule, savedReport } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";
import { processReportScheduleById } from "@/lib/reports/schedule-processor";

export function registerReportScheduleTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "create_report_schedule",
    "Create a scheduled report that will be emailed to recipients on a recurring basis. Requires a saved report ID.",
    {
      savedReportId: z
        .string()
        .describe("UUID of the saved report to schedule"),
      frequency: z
        .enum(["daily", "weekly", "monthly", "quarterly"])
        .describe("How often the report should be sent"),
      format: z
        .enum(["pdf", "csv", "xlsx"])
        .default("pdf")
        .describe("Output format for the report"),
      recipients: z
        .array(z.string())
        .describe("Array of email addresses to receive the report"),
      dayOfWeek: z
        .number()
        .int()
        .min(0)
        .max(6)
        .nullable()
        .optional()
        .describe("Day of week (0=Sunday, 6=Saturday) for weekly schedules"),
      dayOfMonth: z
        .number()
        .int()
        .min(1)
        .max(28)
        .nullable()
        .optional()
        .describe("Day of month (1-28) for monthly/quarterly schedules"),
      timeOfDay: z
        .string()
        .default("08:00")
        .describe("Time of day in HH:MM format (24h)"),
      timezone: z
        .string()
        .default("UTC")
        .describe("IANA timezone string (e.g. America/New_York)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        // Validate saved report exists
        const report = await db.query.savedReport.findFirst({
          where: and(
            eq(savedReport.id, params.savedReportId),
            eq(savedReport.organizationId, ctx.organizationId),
            notDeleted(savedReport.deletedAt)
          ),
        });

        if (!report) {
          throw new Error("Saved report not found");
        }

        const now = new Date();
        const nextRunAt = new Date(now);
        nextRunAt.setDate(nextRunAt.getDate() + 1);

        const [created] = await db
          .insert(reportSchedule)
          .values({
            organizationId: ctx.organizationId,
            savedReportId: params.savedReportId,
            frequency: params.frequency,
            format: params.format,
            recipients: params.recipients,
            dayOfWeek: params.dayOfWeek ?? null,
            dayOfMonth: params.dayOfMonth ?? null,
            timeOfDay: params.timeOfDay,
            timezone: params.timezone,
            nextRunAt,
          })
          .returning();

        return created;
      })
  );

  server.tool(
    "list_report_schedules",
    "List all report schedules for the current organization with pagination. Returns schedules with their associated saved report details.",
    {
      page: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe("Page number (starts at 1)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(50)
        .describe("Number of items per page (max 100)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const offset = (params.page - 1) * params.limit;

        const conditions = [
          eq(reportSchedule.organizationId, ctx.organizationId),
          notDeleted(reportSchedule.deletedAt),
        ];

        const items = await db.query.reportSchedule.findMany({
          where: and(...conditions),
          orderBy: desc(reportSchedule.createdAt),
          limit: params.limit,
          offset,
          with: { savedReport: true },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(reportSchedule)
          .where(and(...conditions));

        return {
          data: items,
          pagination: {
            page: params.page,
            limit: params.limit,
            total: Number(countResult?.count || 0),
            totalPages: Math.ceil(Number(countResult?.count || 0) / params.limit),
          },
        };
      })
  );

  server.tool(
    "update_report_schedule",
    "Update an existing report schedule by ID. Only provided fields will be changed.",
    {
      id: z
        .string()
        .describe("UUID of the report schedule to update"),
      frequency: z
        .enum(["daily", "weekly", "monthly", "quarterly"])
        .optional()
        .describe("How often the report should be sent"),
      format: z
        .enum(["pdf", "csv", "xlsx"])
        .optional()
        .describe("Output format for the report"),
      recipients: z
        .array(z.string())
        .optional()
        .describe("Array of email addresses to receive the report"),
      dayOfWeek: z
        .number()
        .int()
        .min(0)
        .max(6)
        .nullable()
        .optional()
        .describe("Day of week (0=Sunday, 6=Saturday) for weekly schedules"),
      dayOfMonth: z
        .number()
        .int()
        .min(1)
        .max(28)
        .nullable()
        .optional()
        .describe("Day of month (1-28) for monthly/quarterly schedules"),
      timeOfDay: z
        .string()
        .optional()
        .describe("Time of day in HH:MM format (24h)"),
      timezone: z
        .string()
        .optional()
        .describe("IANA timezone string (e.g. America/New_York)"),
      isActive: z
        .boolean()
        .optional()
        .describe("Whether the schedule is active"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const existing = await db.query.reportSchedule.findFirst({
          where: and(
            eq(reportSchedule.id, params.id),
            eq(reportSchedule.organizationId, ctx.organizationId),
            notDeleted(reportSchedule.deletedAt)
          ),
        });

        if (!existing) {
          throw new Error("Report schedule not found");
        }

        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (params.frequency !== undefined) updates.frequency = params.frequency;
        if (params.format !== undefined) updates.format = params.format;
        if (params.recipients !== undefined) updates.recipients = params.recipients;
        if (params.dayOfWeek !== undefined) updates.dayOfWeek = params.dayOfWeek;
        if (params.dayOfMonth !== undefined) updates.dayOfMonth = params.dayOfMonth;
        if (params.timeOfDay !== undefined) updates.timeOfDay = params.timeOfDay;
        if (params.timezone !== undefined) updates.timezone = params.timezone;
        if (params.isActive !== undefined) updates.isActive = params.isActive;

        const [updated] = await db
          .update(reportSchedule)
          .set(updates)
          .where(eq(reportSchedule.id, params.id))
          .returning();

        return updated;
      })
  );

  server.tool(
    "delete_report_schedule",
    "Soft-delete a report schedule by ID. The schedule will no longer run but the record is preserved.",
    {
      id: z
        .string()
        .describe("UUID of the report schedule to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const existing = await db.query.reportSchedule.findFirst({
          where: and(
            eq(reportSchedule.id, params.id),
            eq(reportSchedule.organizationId, ctx.organizationId),
            notDeleted(reportSchedule.deletedAt)
          ),
        });

        if (!existing) {
          throw new Error("Report schedule not found");
        }

        await db
          .update(reportSchedule)
          .set(softDelete())
          .where(eq(reportSchedule.id, params.id));

        return { success: true };
      })
  );

  server.tool(
    "trigger_report_schedule",
    "Immediately trigger a report schedule by ID, sending the report to all configured recipients regardless of the next scheduled run time.",
    {
      id: z
        .string()
        .describe("UUID of the report schedule to trigger immediately"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const result = await processReportScheduleById(
          params.id,
          ctx.organizationId
        );
        return result;
      })
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { timeEntry, runningTimer, timesheet, member } from "@/lib/db/schema";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerTimeTrackingTools(server: McpServer, ctx: AuthContext) {
  // ─── Time Entries ────────────────────────────────────────────────

  server.tool(
    "list_time_entries",
    "List time entries with optional filters by project, user, date range, and billable status. Returns paginated results with total count.",
    {
      projectId: z
        .string()
        .optional()
        .describe("Filter by project UUID"),
      userId: z
        .string()
        .optional()
        .describe("Filter by user UUID"),
      dateFrom: z
        .string()
        .optional()
        .describe("Start date (inclusive, YYYY-MM-DD)"),
      dateTo: z
        .string()
        .optional()
        .describe("End date (inclusive, YYYY-MM-DD)"),
      isBillable: z
        .boolean()
        .optional()
        .describe("Filter by billable status"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of entries to return (max 100)"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [eq(timeEntry.userId, ctx.userId)];

        if (params.projectId) {
          conditions.push(eq(timeEntry.projectId, params.projectId));
        }
        if (params.userId) {
          conditions.push(eq(timeEntry.userId, params.userId));
        }
        if (params.dateFrom) {
          conditions.push(gte(timeEntry.date, params.dateFrom));
        }
        if (params.dateTo) {
          conditions.push(lte(timeEntry.date, params.dateTo));
        }
        if (params.isBillable !== undefined) {
          conditions.push(eq(timeEntry.isBillable, params.isBillable));
        }

        const offset = (params.page - 1) * params.limit;

        const entries = await db.query.timeEntry.findMany({
          where: and(...conditions),
          orderBy: desc(timeEntry.date),
          limit: params.limit,
          offset,
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(timeEntry)
          .where(and(...conditions));

        return {
          entries,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "create_time_entry",
    "Create a new time entry for the current user. Hourly rate is in integer cents (e.g. $50/hr = 5000). Minutes is the duration worked.",
    {
      projectId: z
        .string()
        .describe("Project UUID to log time against"),
      date: z
        .string()
        .describe("Date of the entry (YYYY-MM-DD)"),
      minutes: z
        .number()
        .int()
        .min(1)
        .describe("Duration in minutes"),
      description: z
        .string()
        .optional()
        .describe("Description of work performed"),
      isBillable: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether the entry is billable"),
      hourlyRateCents: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("Hourly rate in cents (e.g. $50/hr = 5000)"),
      taskId: z
        .string()
        .optional()
        .describe("Project task UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:time-tracking");

        const [created] = await db
          .insert(timeEntry)
          .values({
            projectId: params.projectId,
            userId: ctx.userId,
            date: params.date,
            minutes: params.minutes,
            description: params.description ?? null,
            isBillable: params.isBillable,
            hourlyRate: params.hourlyRateCents,
            taskId: params.taskId ?? null,
          })
          .returning();

        return { entry: created };
      })
  );

  server.tool(
    "update_time_entry",
    "Update an existing time entry owned by the current user. Only provided fields are updated.",
    {
      entryId: z
        .string()
        .describe("UUID of the time entry to update"),
      date: z
        .string()
        .optional()
        .describe("New date (YYYY-MM-DD)"),
      minutes: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("New duration in minutes"),
      description: z
        .string()
        .optional()
        .describe("New description"),
      isBillable: z
        .boolean()
        .optional()
        .describe("New billable status"),
      hourlyRateCents: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("New hourly rate in cents"),
      taskId: z
        .string()
        .optional()
        .describe("New project task UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:time-tracking");

        const existing = await db.query.timeEntry.findFirst({
          where: and(
            eq(timeEntry.id, params.entryId),
            eq(timeEntry.userId, ctx.userId)
          ),
        });

        if (!existing) throw new Error("Time entry not found");

        const updates: Record<string, unknown> = {};
        if (params.date !== undefined) updates.date = params.date;
        if (params.minutes !== undefined) updates.minutes = params.minutes;
        if (params.description !== undefined) updates.description = params.description;
        if (params.isBillable !== undefined) updates.isBillable = params.isBillable;
        if (params.hourlyRateCents !== undefined) updates.hourlyRate = params.hourlyRateCents;
        if (params.taskId !== undefined) updates.taskId = params.taskId;

        const [updated] = await db
          .update(timeEntry)
          .set(updates)
          .where(eq(timeEntry.id, params.entryId))
          .returning();

        return { entry: updated };
      })
  );

  server.tool(
    "delete_time_entry",
    "Permanently delete a time entry owned by the current user.",
    {
      entryId: z
        .string()
        .describe("UUID of the time entry to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:time-tracking");

        const existing = await db.query.timeEntry.findFirst({
          where: and(
            eq(timeEntry.id, params.entryId),
            eq(timeEntry.userId, ctx.userId)
          ),
        });

        if (!existing) throw new Error("Time entry not found");

        await db.delete(timeEntry).where(eq(timeEntry.id, params.entryId));

        return { deleted: true, entryId: params.entryId };
      })
  );

  // ─── Running Timers ──────────────────────────────────────────────

  server.tool(
    "start_timer",
    "Start a new running timer for the current user. Only one timer can be running per user at a time.",
    {
      projectId: z
        .string()
        .describe("Project UUID to track time against"),
      description: z
        .string()
        .optional()
        .describe("Description of work being done"),
      taskId: z
        .string()
        .optional()
        .describe("Project task UUID"),
      isBillable: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether the tracked time is billable"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const existingTimer = await db.query.runningTimer.findFirst({
          where: eq(runningTimer.userId, ctx.userId),
        });

        if (existingTimer) {
          throw new Error("A timer is already running. Stop it before starting a new one.");
        }

        const [created] = await db
          .insert(runningTimer)
          .values({
            projectId: params.projectId,
            userId: ctx.userId,
            startedAt: new Date(),
            description: params.description ?? null,
            taskId: params.taskId ?? null,
            isBillable: params.isBillable,
          })
          .returning();

        return { timer: created };
      })
  );

  server.tool(
    "stop_timer",
    "Stop a running timer by ID, calculate elapsed time, create a time entry, and delete the timer. Returns the created time entry.",
    {
      timerId: z
        .string()
        .describe("UUID of the running timer to stop"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const timer = await db.query.runningTimer.findFirst({
          where: and(
            eq(runningTimer.id, params.timerId),
            eq(runningTimer.userId, ctx.userId)
          ),
        });

        if (!timer) throw new Error("Running timer not found");

        const now = new Date();
        let totalSeconds = timer.accumulatedSeconds;

        // If the timer is not paused, add the time since startedAt
        if (!timer.pausedAt) {
          totalSeconds += Math.floor(
            (now.getTime() - timer.startedAt.getTime()) / 1000
          );
        }

        const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
        const today = now.toISOString().split("T")[0];

        const [entry] = await db
          .insert(timeEntry)
          .values({
            projectId: timer.projectId,
            userId: ctx.userId,
            taskId: timer.taskId,
            date: today,
            description: timer.description,
            minutes: totalMinutes,
            isBillable: timer.isBillable,
            hourlyRate: 0,
          })
          .returning();

        await db
          .delete(runningTimer)
          .where(eq(runningTimer.id, params.timerId));

        return { entry, elapsedSeconds: totalSeconds };
      })
  );

  server.tool(
    "get_running_timer",
    "Get the currently running timer for the current user. Returns null if no timer is running.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const timer = await db.query.runningTimer.findFirst({
          where: eq(runningTimer.userId, ctx.userId),
        });

        return { timer: timer ?? null };
      })
  );

  // ─── Timesheets ──────────────────────────────────────────────────

  server.tool(
    "list_timesheets",
    "List timesheets for the organization. Supports filtering by status, employee, and period date range. Returns paginated results.",
    {
      status: z
        .enum(["draft", "submitted", "approved", "rejected"])
        .optional()
        .describe("Filter by timesheet status"),
      employeeId: z
        .string()
        .optional()
        .describe("Filter by payroll employee UUID"),
      periodFrom: z
        .string()
        .optional()
        .describe("Filter timesheets with period starting on or after this date (YYYY-MM-DD)"),
      periodTo: z
        .string()
        .optional()
        .describe("Filter timesheets with period ending on or before this date (YYYY-MM-DD)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of timesheets to return (max 100)"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(timesheet.organizationId, ctx.organizationId),
          notDeleted(timesheet.deletedAt),
        ];

        if (params.status) {
          conditions.push(eq(timesheet.status, params.status));
        }
        if (params.employeeId) {
          conditions.push(eq(timesheet.employeeId, params.employeeId));
        }
        if (params.periodFrom) {
          conditions.push(gte(timesheet.periodStart, params.periodFrom));
        }
        if (params.periodTo) {
          conditions.push(lte(timesheet.periodEnd, params.periodTo));
        }

        const offset = (params.page - 1) * params.limit;

        const timesheets = await db.query.timesheet.findMany({
          where: and(...conditions),
          orderBy: desc(timesheet.periodStart),
          limit: params.limit,
          offset,
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(timesheet)
          .where(and(...conditions));

        return {
          timesheets,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "submit_timesheet",
    "Submit a draft timesheet for approval. Only timesheets in 'draft' status can be submitted.",
    {
      timesheetId: z
        .string()
        .describe("UUID of the timesheet to submit"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:time-tracking");

        const existing = await db.query.timesheet.findFirst({
          where: and(
            eq(timesheet.id, params.timesheetId),
            eq(timesheet.organizationId, ctx.organizationId),
            notDeleted(timesheet.deletedAt)
          ),
        });

        if (!existing) throw new Error("Timesheet not found");
        if (existing.status !== "draft") {
          throw new Error("Only draft timesheets can be submitted");
        }

        const [updated] = await db
          .update(timesheet)
          .set({
            status: "submitted",
            submittedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(timesheet.id, params.timesheetId))
          .returning();

        return { timesheet: updated };
      })
  );

  server.tool(
    "approve_timesheet",
    "Approve a submitted timesheet. Only timesheets in 'submitted' status can be approved. Records the approving member.",
    {
      timesheetId: z
        .string()
        .describe("UUID of the timesheet to approve"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:time-tracking");

        const existing = await db.query.timesheet.findFirst({
          where: and(
            eq(timesheet.id, params.timesheetId),
            eq(timesheet.organizationId, ctx.organizationId),
            notDeleted(timesheet.deletedAt)
          ),
        });

        if (!existing) throw new Error("Timesheet not found");
        if (existing.status !== "submitted") {
          throw new Error("Only submitted timesheets can be approved");
        }

        const currentMember = await db.query.member.findFirst({
          where: and(
            eq(member.userId, ctx.userId),
            eq(member.organizationId, ctx.organizationId)
          ),
        });

        if (!currentMember) throw new Error("Member not found");

        const [updated] = await db
          .update(timesheet)
          .set({
            status: "approved",
            approvedBy: currentMember.id,
            approvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(timesheet.id, params.timesheetId))
          .returning();

        return { timesheet: updated };
      })
  );
}

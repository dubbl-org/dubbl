import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { timeEntry, runningTimer, timesheet, timesheetEntry, payrollEmployee, project, member, projectTask } from "@/lib/db/schema";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";
import { ProjectError, ProjectNotFoundError, requireProjectAccess } from "@/lib/api/project-access";
import { resolveTimeEntryRate, syncProjectBilling } from "@/lib/api/project-billing";
import { localISODate, timeEntryChangeError } from "@/lib/projects/rules";

/** A task id must belong to the project the time is logged on. */
async function assertTaskInProject(projectId: string, taskId: string | null | undefined) {
  if (!taskId) return;
  const task = await db.query.projectTask.findFirst({
    where: and(eq(projectTask.id, taskId), eq(projectTask.projectId, projectId)),
    columns: { id: true },
  });
  if (!task) throw new ProjectNotFoundError("Task");
}

/** Elapsed seconds of a running timer (paused timers keep their accumulated time). */
function timerSeconds(timer: { pausedAt: Date | null; startedAt: Date; accumulatedSeconds: number }, now = new Date()) {
  return timer.pausedAt
    ? timer.accumulatedSeconds
    : timer.accumulatedSeconds + Math.floor((now.getTime() - timer.startedAt.getTime()) / 1000);
}

export function registerTimeTrackingTools(server: McpServer, ctx: AuthContext) {
  // ─── Time Entries ────────────────────────────────────────────────

  server.tool(
    "list_time_entries",
    "List time entries with optional filters by project, user, date range, and billable status. Without projectId it lists the current user's own entries; with projectId it lists everyone's entries on that project (narrow with userId). minutes is the duration; hourlyRate is cents per hour; invoiceId is set while the entry is on a live invoice. Returns paginated results with total count.",
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
        const conditions = [];

        if (params.projectId) {
          await requireProjectAccess(ctx, params.projectId, "view");
          // Entries on voided/deleted invoices are unbilled again.
          await syncProjectBilling(db, ctx.organizationId, [params.projectId]);
          conditions.push(eq(timeEntry.projectId, params.projectId));
        } else {
          conditions.push(eq(timeEntry.userId, ctx.userId));
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
    "Log a time entry for the current user on a project (needs contributor access). Minutes is the duration worked. hourlyRateCents is the billing rate in integer cents (e.g. $50/hr = 5000); omit it to use the person's project member rate, else the project's hourly rate. Returns the entry.",
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
        .describe("Hourly rate in cents (e.g. $50/hr = 5000); omit to use the member or project rate"),
      taskId: z
        .string()
        .optional()
        .describe("Project task UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:time-tracking");
        const { project: proj } = await requireProjectAccess(ctx, params.projectId, "contribute");
        await assertTaskInProject(params.projectId, params.taskId);

        const [created] = await db
          .insert(timeEntry)
          .values({
            projectId: params.projectId,
            userId: ctx.userId,
            date: params.date,
            minutes: params.minutes,
            description: params.description ?? null,
            isBillable: params.isBillable,
            hourlyRate: params.hourlyRateCents ?? (await resolveTimeEntryRate(db, proj, ctx.userId)),
            taskId: params.taskId ?? null,
          })
          .returning();
        await syncProjectBilling(db, ctx.organizationId, [params.projectId]);

        return { entry: created };
      })
  );

  server.tool(
    "update_time_entry",
    "Update a time entry. Your own entries need contributor access on the project; other people's need manager access. While the entry is on an invoice (not voided or deleted) only description and taskId can change. Only provided fields are updated.",
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

        const found = await db.query.timeEntry.findFirst({
          where: eq(timeEntry.id, params.entryId),
          columns: { projectId: true },
        });
        if (!found) throw new ProjectNotFoundError("Time entry");
        const { access } = await requireProjectAccess(ctx, found.projectId, "contribute");
        await syncProjectBilling(db, ctx.organizationId, [found.projectId]);
        const existing = (await db.query.timeEntry.findFirst({ where: eq(timeEntry.id, params.entryId) }))!;

        const blocked = timeEntryChangeError(
          existing,
          {
            date: params.date,
            minutes: params.minutes,
            isBillable: params.isBillable,
            hourlyRate: params.hourlyRateCents,
          },
          { userId: ctx.userId, access }
        );
        if (blocked) throw new ProjectError(blocked.message, blocked.status);
        await assertTaskInProject(existing.projectId, params.taskId);

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
        await syncProjectBilling(db, ctx.organizationId, [existing.projectId]);

        return { entry: updated };
      })
  );

  server.tool(
    "delete_time_entry",
    "Permanently delete a time entry. Your own entries need contributor access; other people's need manager access. Invoiced time (on an invoice that is not voided or deleted) can't be deleted.",
    {
      entryId: z
        .string()
        .describe("UUID of the time entry to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:time-tracking");

        const found = await db.query.timeEntry.findFirst({
          where: eq(timeEntry.id, params.entryId),
          columns: { projectId: true },
        });
        if (!found) throw new ProjectNotFoundError("Time entry");
        const { access } = await requireProjectAccess(ctx, found.projectId, "contribute");
        await syncProjectBilling(db, ctx.organizationId, [found.projectId]);
        const existing = (await db.query.timeEntry.findFirst({ where: eq(timeEntry.id, params.entryId) }))!;

        const blocked = timeEntryChangeError(existing, "delete", { userId: ctx.userId, access });
        if (blocked) throw new ProjectError(blocked.message, blocked.status);

        await db.delete(timeEntry).where(eq(timeEntry.id, params.entryId));
        await syncProjectBilling(db, ctx.organizationId, [found.projectId]);

        return { deleted: true, entryId: params.entryId };
      })
  );

  // ─── Running Timers ──────────────────────────────────────────────

  server.tool(
    "start_timer",
    "Start a running timer for the current user on a project (needs contributor access). Only one timer can run per user at a time. Returns the timer.",
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
        await requireProjectAccess(ctx, params.projectId, "contribute");
        await assertTaskInProject(params.projectId, params.taskId);
        const existingTimer = await db.query.runningTimer.findFirst({
          where: eq(runningTimer.userId, ctx.userId),
        });

        if (existingTimer) {
          throw new ProjectError("A timer is already running. Stop it before starting a new one.", 409);
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
    "Stop a running timer by ID: logs a time entry dated today (the user's elapsed time rounded to whole minutes, at least 1) at the member or project billing rate, then deletes the timer. Returns the created time entry and elapsedSeconds.",
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

        if (!timer) throw new ProjectNotFoundError("Running timer");
        const { project: proj } = await requireProjectAccess(ctx, timer.projectId, "contribute");

        const now = new Date();
        const totalSeconds = timerSeconds(timer, now);
        const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
        const today = localISODate(now);

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
            hourlyRate: await resolveTimeEntryRate(db, proj, ctx.userId),
          })
          .returning();

        await db
          .delete(runningTimer)
          .where(eq(runningTimer.id, params.timerId));
        await syncProjectBilling(db, ctx.organizationId, [timer.projectId]);

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

        return { timer: timer ?? null, elapsedSeconds: timer ? timerSeconds(timer) : 0 };
      })
  );

  server.tool(
    "pause_timer",
    "Pause the current user's running timer by ID. The elapsed time so far is kept. Returns the timer and elapsedSeconds.",
    {
      timerId: z.string().describe("UUID of the running timer"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const timer = await db.query.runningTimer.findFirst({
          where: and(eq(runningTimer.id, params.timerId), eq(runningTimer.userId, ctx.userId)),
        });
        if (!timer) throw new ProjectNotFoundError("Running timer");
        if (timer.pausedAt) return { timer, elapsedSeconds: timer.accumulatedSeconds };
        const now = new Date();
        const [updated] = await db
          .update(runningTimer)
          .set({ pausedAt: now, accumulatedSeconds: timerSeconds(timer, now) })
          .where(eq(runningTimer.id, timer.id))
          .returning();
        return { timer: updated, elapsedSeconds: updated.accumulatedSeconds };
      })
  );

  server.tool(
    "resume_timer",
    "Resume the current user's paused timer by ID. Returns the timer and elapsedSeconds.",
    {
      timerId: z.string().describe("UUID of the running timer"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const timer = await db.query.runningTimer.findFirst({
          where: and(eq(runningTimer.id, params.timerId), eq(runningTimer.userId, ctx.userId)),
        });
        if (!timer) throw new ProjectNotFoundError("Running timer");
        if (!timer.pausedAt) return { timer, elapsedSeconds: timerSeconds(timer) };
        const [updated] = await db
          .update(runningTimer)
          .set({ pausedAt: null, startedAt: new Date() })
          .where(eq(runningTimer.id, timer.id))
          .returning();
        return { timer: updated, elapsedSeconds: updated.accumulatedSeconds };
      })
  );

  server.tool(
    "discard_timer",
    "Throw away the current user's running timer by ID without logging any time.",
    {
      timerId: z.string().describe("UUID of the running timer"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const [removed] = await db
          .delete(runningTimer)
          .where(and(eq(runningTimer.id, params.timerId), eq(runningTimer.userId, ctx.userId)))
          .returning({ id: runningTimer.id });
        if (!removed) throw new ProjectNotFoundError("Running timer");
        return { discarded: true, timerId: params.timerId };
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
    "Submit a payroll timesheet for approval. Works for drafts and for timesheets that were sent back ('rejected'); it needs at least some hours entered. Clears any earlier rejection reason. Returns the timesheet.",
    {
      timesheetId: z
        .string()
        .describe("UUID of the timesheet to submit"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:timesheets");

        const existing = await db.query.timesheet.findFirst({
          where: and(
            eq(timesheet.id, params.timesheetId),
            eq(timesheet.organizationId, ctx.organizationId),
            notDeleted(timesheet.deletedAt)
          ),
        });

        if (!existing) throw new Error("Timesheet not found");
        if (existing.status !== "draft" && existing.status !== "rejected") {
          throw new Error("Only draft or sent-back timesheets can be submitted");
        }
        if (existing.totalHours <= 0) throw new Error("Add the hours worked before submitting");

        const [updated] = await db
          .update(timesheet)
          .set({
            status: "submitted",
            submittedAt: new Date(),
            rejectionReason: null,
            updatedAt: new Date(),
          })
          .where(eq(timesheet.id, params.timesheetId))
          .returning();

        return { timesheet: updated };
      })
  );

  server.tool(
    "approve_timesheet",
    "Approve a submitted payroll timesheet. Only timesheets in 'submitted' status can be approved. Approved hours are paid in the next pay run covering the period (regular hours, weekly overtime and shift premiums). Records the approving member. Requires the approve:payroll permission.",
    {
      timesheetId: z
        .string()
        .describe("UUID of the timesheet to approve"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:payroll");

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

  server.tool(
    "reject_timesheet",
    "Send a submitted payroll timesheet back to the employee, optionally saying why. It can then be edited and submitted again. Requires the approve:payroll permission. Returns the timesheet.",
    {
      timesheetId: z.string().uuid().describe("UUID of the submitted timesheet"),
      reason: z.string().optional().describe("What needs fixing, shown on the timesheet"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:payroll");
        const existing = await db.query.timesheet.findFirst({
          where: and(
            eq(timesheet.id, params.timesheetId),
            eq(timesheet.organizationId, ctx.organizationId),
            notDeleted(timesheet.deletedAt)
          ),
        });
        if (!existing) throw new Error("Timesheet not found");
        if (existing.status !== "submitted") throw new Error("Only submitted timesheets can be rejected");
        const [updated] = await db
          .update(timesheet)
          .set({ status: "rejected", rejectionReason: params.reason || null, updatedAt: new Date() })
          .where(eq(timesheet.id, existing.id))
          .returning();
        return { timesheet: updated };
      })
  );

  server.tool(
    "create_timesheet",
    "Create an empty draft payroll timesheet for an employee and period. Add hours with add_timesheet_entry, then submit_timesheet. Dates are YYYY-MM-DD. Requires the manage:timesheets permission. Returns the timesheet.",
    {
      employeeId: z.string().uuid().describe("UUID of the payroll employee"),
      periodStart: z.string().describe("First day of the period (YYYY-MM-DD)"),
      periodEnd: z.string().describe("Last day of the period (YYYY-MM-DD), on or after periodStart"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:timesheets");
        if (params.periodEnd < params.periodStart) throw new Error("The period end must be on or after its start");
        const emp = await db.query.payrollEmployee.findFirst({
          where: and(
            eq(payrollEmployee.id, params.employeeId),
            eq(payrollEmployee.organizationId, ctx.organizationId),
            notDeleted(payrollEmployee.deletedAt)
          ),
          columns: { id: true },
        });
        if (!emp) throw new Error("Employee not found");
        const [created] = await db
          .insert(timesheet)
          .values({ organizationId: ctx.organizationId, ...params })
          .returning();
        return { timesheet: created };
      })
  );

  server.tool(
    "add_timesheet_entry",
    "Add hours worked on one day to a payroll timesheet that is a draft or was sent back. The date must be inside the timesheet period. shiftType 'regular' hours count towards weekly overtime; 'overtime' hours are always paid at the overtime multiplier; night/weekend/holiday add that shift's premium. Requires the manage:timesheets permission. Returns the entry.",
    {
      timesheetId: z.string().uuid().describe("UUID of the timesheet"),
      date: z.string().describe("Day worked (YYYY-MM-DD), inside the timesheet period"),
      hours: z.number().positive().max(24).describe("Hours worked that day, more than 0 and at most 24 (e.g. 7.5)"),
      shiftType: z.enum(["regular", "overtime", "night", "weekend", "holiday"]).optional().describe("Kind of shift; defaults to regular"),
      description: z.string().optional().describe("What was worked on"),
      projectId: z.string().uuid().optional().describe("Optional project UUID the hours were for"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:timesheets");
        const { timesheetId, ...values } = params;
        const ts = await db.query.timesheet.findFirst({
          where: and(
            eq(timesheet.id, timesheetId),
            eq(timesheet.organizationId, ctx.organizationId),
            notDeleted(timesheet.deletedAt)
          ),
        });
        if (!ts) throw new Error("Timesheet not found");
        if (ts.status !== "draft" && ts.status !== "rejected") {
          throw new Error("Entries can only be added while a timesheet is a draft or was sent back");
        }
        if (values.date < ts.periodStart || values.date > ts.periodEnd) {
          throw new Error(`The date must be within the timesheet period (${ts.periodStart} to ${ts.periodEnd})`);
        }
        if (values.projectId) {
          const proj = await db.query.project.findFirst({
            where: and(eq(project.id, values.projectId), eq(project.organizationId, ctx.organizationId)),
            columns: { id: true },
          });
          if (!proj) throw new Error("Project not found");
        }
        const entry = await db.transaction(async (tx) => {
          const [row] = await tx.insert(timesheetEntry).values({ timesheetId, ...values }).returning();
          await tx
            .update(timesheet)
            .set({ totalHours: sql`${timesheet.totalHours} + ${values.hours}`, updatedAt: new Date() })
            .where(eq(timesheet.id, timesheetId));
          return row;
        });
        return { entry };
      })
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  contact,
  member,
  milestoneAssignment,
  payrollEmployee,
  project,
  projectMember,
  projectMilestone,
  projectNote,
  projectTask,
  runningTimer,
  taskChecklist,
  taskComment,
  timeEntry,
} from "@/lib/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { checkResourceLimit } from "@/lib/api/check-limit";
import { logAudit } from "@/lib/api/audit";
import { currencyCodeSchema } from "@/lib/currency/zod";
import {
  ProjectError,
  ProjectNotFoundError,
  getProjectAccess,
  requireProjectAccess,
} from "@/lib/api/project-access";
import { syncProjectBilling } from "@/lib/api/project-billing";
import { createProjectInvoice, getProjectUninvoiced } from "@/lib/api/project-invoicing";
import { summarizeTimeEntries } from "@/lib/projects/rules";
import { notifySafely, notifyTaskAssigned } from "@/lib/notifications/events";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

const PROJECT_STATUS = ["active", "completed", "on_hold", "cancelled", "archived"] as const;
const PROJECT_PRIORITY = ["low", "medium", "high", "urgent"] as const;
const BILLING_TYPE = ["hourly", "fixed", "milestone", "non_billable"] as const;
const PROJECT_ROLE = ["manager", "contributor", "viewer"] as const;
const TASK_STATUS = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"] as const;
const MILESTONE_STATUS = ["upcoming", "in_progress", "completed", "overdue"] as const;

const userColumns = { id: true, name: true, email: true } as const;

async function findTask(projectId: string, taskId: string) {
  const task = await db.query.projectTask.findFirst({
    where: and(eq(projectTask.id, taskId), eq(projectTask.projectId, projectId)),
  });
  if (!task) throw new ProjectNotFoundError("Task");
  return task;
}

async function findMilestone(projectId: string, milestoneId: string) {
  const milestone = await db.query.projectMilestone.findFirst({
    where: and(eq(projectMilestone.id, milestoneId), eq(projectMilestone.projectId, projectId)),
  });
  if (!milestone) throw new ProjectNotFoundError("Milestone");
  return milestone;
}

async function assertOrgMember(ctx: AuthContext, memberId: string) {
  const found = await db.query.member.findFirst({
    where: and(eq(member.id, memberId), eq(member.organizationId, ctx.organizationId)),
    columns: { id: true },
  });
  if (!found) throw new ProjectError("Member not found in this organization", 400);
}

export function registerProjectManagementTools(server: McpServer, ctx: AuthContext) {
  // ─── Projects ──────────────────────────────────────────────────────────
  server.tool(
    "list_projects",
    "List projects with optional status/priority filters. Each row has budget, hourlyRate, fixedPrice and totalBilled in integer cents (totalBilled = issued, non-void invoices only), totalHours and estimatedHours in MINUTES, plus client name and member count. Paginated.",
    {
      status: z.enum(PROJECT_STATUS).optional().describe("Only projects with this status"),
      priority: z.enum(PROJECT_PRIORITY).optional().describe("Only projects with this priority"),
      search: z.string().optional().describe("Case-insensitive match on project name"),
      page: z.number().int().min(1).optional().default(1).describe("Page number, starting at 1"),
      limit: z.number().int().min(1).max(100).optional().default(50).describe("Rows per page (max 100)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [eq(project.organizationId, ctx.organizationId), notDeleted(project.deletedAt)];
        if (params.status) conditions.push(eq(project.status, params.status));
        if (params.priority) conditions.push(eq(project.priority, params.priority));
        if (params.search) conditions.push(sql`${project.name} ILIKE ${"%" + params.search + "%"}`);

        const ids = await db.select({ id: project.id }).from(project).where(and(...conditions));
        await syncProjectBilling(db, ctx.organizationId, ids.map((r) => r.id));

        const rows = await db.query.project.findMany({
          where: and(...conditions),
          orderBy: desc(project.createdAt),
          limit: params.limit,
          offset: (params.page - 1) * params.limit,
          with: { contact: { columns: { id: true, name: true } }, members: { columns: { id: true } } },
        });

        return {
          projects: rows.map(({ members, ...p }) => ({ ...p, memberCount: members.length })),
          total: ids.length,
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "get_project",
    "Get one project with its members (role, hourlyRate and costRate in cents/hour), tasks, milestones (amount and invoicedAmountCents in cents), assigned teams, and a money summary: billableAmount (billable time value), unbilledAmount, totalBilled (issued invoices) and unissuedBilled (draft or awaiting-approval invoices) in cents; totalMinutes and billableMinutes in minutes. Also returns access: what the caller may do on it (view, contribute or manage).",
    {
      projectId: z.string().describe("Project UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "view");
        const totals = await syncProjectBilling(db, ctx.organizationId, [params.projectId]);
        const found = await db.query.project.findFirst({
          where: eq(project.id, params.projectId),
          with: {
            contact: { columns: { id: true, name: true } },
            members: { with: { member: { with: { user: { columns: userColumns } } } } },
            tasks: { orderBy: asc(projectTask.sortOrder) },
            milestones: { orderBy: asc(projectMilestone.sortOrder) },
            teamAssignments: { with: { team: { columns: { id: true, name: true } } } },
            timeEntries: { columns: { minutes: true, hourlyRate: true, isBillable: true, invoiceId: true } },
          },
        });
        if (!found) throw new ProjectNotFoundError();
        const { timeEntries, ...rest } = found;
        const time = summarizeTimeEntries(timeEntries);
        return {
          project: rest,
          summary: {
            totalMinutes: time.totalMinutes,
            billableMinutes: time.billableMinutes,
            billableAmount: time.billableAmount,
            unbilledAmount: time.unbilledAmount,
            avgBillableRate: time.avgRate,
            totalBilled: totals.get(params.projectId)?.totalBilled ?? 0,
            unissuedBilled: totals.get(params.projectId)?.unissuedBilled ?? 0,
            budgetRemaining: found.budget - (totals.get(params.projectId)?.totalBilled ?? 0),
          },
          access: await getProjectAccess(ctx, params.projectId),
        };
      })
  );

  server.tool(
    "create_project",
    "Create a project. Money fields are integer cents (budget = fee budget, the most you plan to bill the client; hourlyRate per hour; fixedPrice for fixed billing). estimatedMinutes is in minutes. The caller is added as the project's manager. Milestone billing turns the Milestones feature on. Returns the created project.",
    {
      name: z.string().min(1).describe("Project name"),
      description: z.string().optional().describe("Project description"),
      contactId: z.string().optional().describe("Client contact UUID (needed to invoice the project)"),
      status: z.enum(PROJECT_STATUS).optional().default("active").describe("Project status"),
      priority: z.enum(PROJECT_PRIORITY).optional().default("medium").describe("Project priority"),
      billingType: z.enum(BILLING_TYPE).optional().default("hourly").describe("How the client is billed: hourly time, fixed price, milestones, or not at all"),
      budgetCents: z.number().int().min(0).optional().default(0).describe("Fee budget in cents"),
      hourlyRateCents: z.number().int().min(0).optional().default(0).describe("Default billing rate in cents per hour"),
      fixedPriceCents: z.number().int().min(0).optional().default(0).describe("Fixed price in cents (fixed billing)"),
      estimatedMinutes: z.number().int().min(0).optional().default(0).describe("Estimated effort in minutes"),
      currency: currencyCodeSchema.optional().default("USD").describe("ISO 4217 currency code for the project's invoices"),
      startDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      endDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
      category: z.string().optional().describe("Free-text category, e.g. Development"),
      color: z.string().optional().describe("Hex colour, e.g. #10b981"),
      tags: z.array(z.string()).optional().default([]).describe("Tags"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:projects");
        await checkResourceLimit(ctx.organizationId, project, project.organizationId, "projects", project.deletedAt);
        if (params.contactId) {
          const c = await db.query.contact.findFirst({
            where: and(eq(contact.id, params.contactId), eq(contact.organizationId, ctx.organizationId)),
            columns: { id: true },
          });
          if (!c) throw new ProjectError("Contact not found", 404);
        }

        const created = await db.transaction(async (tx) => {
          const [row] = await tx
            .insert(project)
            .values({
              organizationId: ctx.organizationId,
              name: params.name,
              description: params.description ?? null,
              contactId: params.contactId ?? null,
              status: params.status,
              priority: params.priority,
              billingType: params.billingType,
              color: params.color || "#10b981",
              budget: params.budgetCents,
              hourlyRate: params.hourlyRateCents,
              fixedPrice: params.fixedPriceCents,
              estimatedHours: params.estimatedMinutes,
              currency: params.currency,
              startDate: params.startDate ?? null,
              endDate: params.endDate ?? null,
              category: params.category ?? null,
              tags: params.tags,
              enableMilestones: params.billingType === "milestone",
            })
            .returning();
          const creator = await tx.query.member.findFirst({
            where: and(eq(member.organizationId, ctx.organizationId), eq(member.userId, ctx.userId)),
            columns: { id: true },
          });
          if (creator) {
            await tx.insert(projectMember).values({ projectId: row.id, memberId: creator.id, role: "manager" });
          }
          return row;
        });

        await logAudit({ ctx, action: "create", entityType: "project", entityId: created.id });
        return { project: created };
      })
  );

  server.tool(
    "update_project",
    "Update a project's details, money settings (integer cents), dates and features. Only fields you pass change. Needs manager access on the project. Returns the updated project.",
    {
      projectId: z.string().describe("Project UUID"),
      name: z.string().min(1).optional().describe("New name"),
      description: z.string().nullable().optional().describe("New description (null clears it)"),
      contactId: z.string().nullable().optional().describe("Client contact UUID (null clears it)"),
      status: z.enum(PROJECT_STATUS).optional().describe("New status"),
      priority: z.enum(PROJECT_PRIORITY).optional().describe("New priority"),
      billingType: z.enum(BILLING_TYPE).optional().describe("New billing type; milestone turns the Milestones feature on"),
      budgetCents: z.number().int().min(0).optional().describe("Fee budget in cents"),
      hourlyRateCents: z.number().int().min(0).optional().describe("Default billing rate in cents per hour"),
      fixedPriceCents: z.number().int().min(0).optional().describe("Fixed price in cents"),
      estimatedMinutes: z.number().int().min(0).optional().describe("Estimated effort in minutes"),
      startDate: z.string().nullable().optional().describe("Start date YYYY-MM-DD (null clears it)"),
      endDate: z.string().nullable().optional().describe("End date YYYY-MM-DD (null clears it)"),
      category: z.string().nullable().optional().describe("Category (null clears it)"),
      color: z.string().optional().describe("Hex colour"),
      tags: z.array(z.string()).optional().describe("Replaces the tag list"),
      enableTasks: z.boolean().optional().describe("Show the Tasks tab"),
      enableTimeTracking: z.boolean().optional().describe("Show the Time tab"),
      enableMilestones: z.boolean().optional().describe("Show the Milestones tab"),
      enableNotes: z.boolean().optional().describe("Show the Notes tab"),
      enableBilling: z.boolean().optional().describe("Show budget and invoicing"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "manage");
        if (params.contactId) {
          const c = await db.query.contact.findFirst({
            where: and(eq(contact.id, params.contactId), eq(contact.organizationId, ctx.organizationId)),
            columns: { id: true },
          });
          if (!c) throw new ProjectError("Contact not found", 404);
        }
        const updates: Partial<typeof project.$inferInsert> = { updatedAt: new Date() };
        if (params.name !== undefined) updates.name = params.name;
        if (params.description !== undefined) updates.description = params.description;
        if (params.contactId !== undefined) updates.contactId = params.contactId;
        if (params.status !== undefined) updates.status = params.status;
        if (params.priority !== undefined) updates.priority = params.priority;
        if (params.billingType !== undefined) updates.billingType = params.billingType;
        if (params.budgetCents !== undefined) updates.budget = params.budgetCents;
        if (params.hourlyRateCents !== undefined) updates.hourlyRate = params.hourlyRateCents;
        if (params.fixedPriceCents !== undefined) updates.fixedPrice = params.fixedPriceCents;
        if (params.estimatedMinutes !== undefined) updates.estimatedHours = params.estimatedMinutes;
        if (params.startDate !== undefined) updates.startDate = params.startDate;
        if (params.endDate !== undefined) updates.endDate = params.endDate;
        if (params.category !== undefined) updates.category = params.category;
        if (params.color !== undefined) updates.color = params.color;
        if (params.tags !== undefined) updates.tags = params.tags;
        if (params.enableTasks !== undefined) updates.enableTasks = params.enableTasks;
        if (params.enableTimeTracking !== undefined) updates.enableTimeTracking = params.enableTimeTracking;
        if (params.enableMilestones !== undefined) updates.enableMilestones = params.enableMilestones;
        if (params.enableNotes !== undefined) updates.enableNotes = params.enableNotes;
        if (params.enableBilling !== undefined) updates.enableBilling = params.enableBilling;
        if (params.billingType === "milestone") updates.enableMilestones = true;

        const [updated] = await db.update(project).set(updates).where(eq(project.id, params.projectId)).returning();
        await logAudit({ ctx, action: "update", entityType: "project", entityId: params.projectId });
        return { project: updated };
      })
  );

  server.tool(
    "delete_project",
    "Delete a project. It moves to Trash (soft delete) and can be restored from there with its tasks, time and notes. Needs manager access.",
    {
      projectId: z.string().describe("Project UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "manage");
        await db.update(project).set(softDelete()).where(eq(project.id, params.projectId));
        await logAudit({ ctx, action: "delete", entityType: "project", entityId: params.projectId });
        return { deleted: true, projectId: params.projectId, restorableFromTrash: true };
      })
  );

  // ─── Tasks ─────────────────────────────────────────────────────────────
  server.tool(
    "list_project_tasks",
    "List a project's tasks with assignee, checklist items and comment count. estimatedMinutes is in minutes. Optional status filter.",
    {
      projectId: z.string().describe("Project UUID"),
      status: z.enum(TASK_STATUS).optional().describe("Only tasks with this status"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "view");
        const tasks = await db.query.projectTask.findMany({
          where: and(
            eq(projectTask.projectId, params.projectId),
            params.status ? eq(projectTask.status, params.status) : undefined
          ),
          orderBy: asc(projectTask.sortOrder),
          with: {
            assignee: { with: { user: { columns: userColumns } } },
            checklist: { orderBy: asc(taskChecklist.sortOrder) },
            comments: { columns: { id: true } },
          },
        });
        return {
          tasks: tasks.map(({ comments, ...t }) => ({ ...t, commentCount: comments.length })),
        };
      })
  );

  const taskFields = {
    description: z.string().nullable().optional().describe("Details (null clears it)"),
    priority: z.enum(PROJECT_PRIORITY).optional().describe("Task priority"),
    assigneeId: z.string().nullable().optional().describe("Org member UUID (member.id, see list_project_members) or null to unassign"),
    startDate: z.string().nullable().optional().describe("Start date YYYY-MM-DD (null clears it)"),
    dueDate: z.string().nullable().optional().describe("Due date YYYY-MM-DD (null clears it)"),
    estimatedMinutes: z.number().int().min(0).nullable().optional().describe("Estimate in minutes (null clears it)"),
  };

  server.tool(
    "create_project_task",
    "Create a task on a project. Needs contributor access. Returns the task.",
    {
      projectId: z.string().describe("Project UUID"),
      title: z.string().min(1).describe("Task title"),
      status: z.enum(TASK_STATUS).optional().default("todo").describe("Initial status"),
      ...taskFields,
    },
    (params) =>
      wrapTool(ctx, async () => {
        const { project: proj } = await requireProjectAccess(ctx, params.projectId, "contribute");
        if (params.assigneeId) await assertOrgMember(ctx, params.assigneeId);
        const [created] = await db
          .insert(projectTask)
          .values({
            projectId: params.projectId,
            title: params.title,
            description: params.description ?? null,
            status: params.status,
            priority: params.priority ?? "medium",
            assigneeId: params.assigneeId ?? null,
            createdById: ctx.userId,
            startDate: params.startDate ?? null,
            dueDate: params.dueDate ?? null,
            estimatedMinutes: params.estimatedMinutes ?? null,
            completedAt: params.status === "done" ? new Date() : null,
          })
          .returning();
        await notifySafely(notifyTaskAssigned(ctx.organizationId, created, proj.name, ctx.userId));
        return { task: created };
      })
  );

  server.tool(
    "update_project_task",
    "Update a task: title, status, priority, assignee, dates or estimate. Setting status to done stamps completedAt; any other status clears it. Needs contributor access. Returns the task.",
    {
      projectId: z.string().describe("Project UUID"),
      taskId: z.string().describe("Task UUID"),
      title: z.string().min(1).optional().describe("New title"),
      status: z.enum(TASK_STATUS).optional().describe("New status"),
      ...taskFields,
    },
    (params) =>
      wrapTool(ctx, async () => {
        const { project: proj } = await requireProjectAccess(ctx, params.projectId, "contribute");
        const existing = await findTask(params.projectId, params.taskId);
        if (params.assigneeId) await assertOrgMember(ctx, params.assigneeId);

        const updates: Partial<typeof projectTask.$inferInsert> = { updatedAt: new Date() };
        if (params.title !== undefined) updates.title = params.title;
        if (params.description !== undefined) updates.description = params.description;
        if (params.priority !== undefined) updates.priority = params.priority;
        if (params.assigneeId !== undefined) updates.assigneeId = params.assigneeId;
        if (params.startDate !== undefined) updates.startDate = params.startDate;
        if (params.dueDate !== undefined) updates.dueDate = params.dueDate;
        if (params.estimatedMinutes !== undefined) updates.estimatedMinutes = params.estimatedMinutes;
        if (params.status !== undefined) {
          updates.status = params.status;
          if (params.status === "done" && existing.status !== "done") updates.completedAt = new Date();
          else if (params.status !== "done") updates.completedAt = null;
        }

        const [updated] = await db.update(projectTask).set(updates).where(eq(projectTask.id, params.taskId)).returning();
        if (updated.assigneeId && updated.assigneeId !== existing.assigneeId) {
          await notifySafely(notifyTaskAssigned(ctx.organizationId, updated, proj.name, ctx.userId));
        }
        return { task: updated };
      })
  );

  server.tool(
    "delete_project_task",
    "Permanently delete a task with its checklist and comments. Time logged against it is kept (the task link is cleared). Needs manager access.",
    {
      projectId: z.string().describe("Project UUID"),
      taskId: z.string().describe("Task UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "manage");
        await findTask(params.projectId, params.taskId);
        await db.transaction(async (tx) => {
          await tx.update(timeEntry).set({ taskId: null }).where(eq(timeEntry.taskId, params.taskId));
          await tx.update(runningTimer).set({ taskId: null }).where(eq(runningTimer.taskId, params.taskId));
          await tx.delete(projectTask).where(eq(projectTask.id, params.taskId));
        });
        return { deleted: true, taskId: params.taskId };
      })
  );

  server.tool(
    "add_task_checklist_item",
    "Add a checklist item (subtask) to a task. Needs contributor access. Returns the item.",
    {
      projectId: z.string().describe("Project UUID"),
      taskId: z.string().describe("Task UUID"),
      title: z.string().min(1).describe("Checklist item text"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "contribute");
        await findTask(params.projectId, params.taskId);
        const [last] = await db
          .select({ max: sql<number>`COALESCE(MAX(${taskChecklist.sortOrder}), -1)`.mapWith(Number) })
          .from(taskChecklist)
          .where(eq(taskChecklist.taskId, params.taskId));
        const [item] = await db
          .insert(taskChecklist)
          .values({ taskId: params.taskId, title: params.title, sortOrder: (last?.max ?? -1) + 1 })
          .returning();
        return { item };
      })
  );

  server.tool(
    "update_task_checklist_item",
    "Tick, untick or rename a task checklist item. Needs contributor access. Returns the item.",
    {
      projectId: z.string().describe("Project UUID"),
      taskId: z.string().describe("Task UUID"),
      itemId: z.string().describe("Checklist item UUID"),
      title: z.string().min(1).optional().describe("New text"),
      isCompleted: z.boolean().optional().describe("true = ticked"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "contribute");
        await findTask(params.projectId, params.taskId);
        const updates: Partial<typeof taskChecklist.$inferInsert> = {};
        if (params.title !== undefined) updates.title = params.title;
        if (params.isCompleted !== undefined) updates.isCompleted = params.isCompleted;
        if (Object.keys(updates).length === 0) throw new ProjectError("Nothing to update", 400);
        const [item] = await db
          .update(taskChecklist)
          .set(updates)
          .where(and(eq(taskChecklist.id, params.itemId), eq(taskChecklist.taskId, params.taskId)))
          .returning();
        if (!item) throw new ProjectNotFoundError("Checklist item");
        return { item };
      })
  );

  server.tool(
    "delete_task_checklist_item",
    "Remove a checklist item from a task. Needs contributor access.",
    {
      projectId: z.string().describe("Project UUID"),
      taskId: z.string().describe("Task UUID"),
      itemId: z.string().describe("Checklist item UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "contribute");
        await findTask(params.projectId, params.taskId);
        const [removed] = await db
          .delete(taskChecklist)
          .where(and(eq(taskChecklist.id, params.itemId), eq(taskChecklist.taskId, params.taskId)))
          .returning({ id: taskChecklist.id });
        if (!removed) throw new ProjectNotFoundError("Checklist item");
        return { deleted: true, itemId: params.itemId };
      })
  );

  server.tool(
    "list_task_comments",
    "List the comments on a task, newest first, with their authors.",
    {
      projectId: z.string().describe("Project UUID"),
      taskId: z.string().describe("Task UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "view");
        await findTask(params.projectId, params.taskId);
        const comments = await db.query.taskComment.findMany({
          where: eq(taskComment.taskId, params.taskId),
          orderBy: desc(taskComment.createdAt),
          with: { author: { columns: userColumns } },
        });
        return { comments };
      })
  );

  server.tool(
    "add_task_comment",
    "Post a comment on a task as the current user. Needs contributor access. Returns the comment.",
    {
      projectId: z.string().describe("Project UUID"),
      taskId: z.string().describe("Task UUID"),
      content: z.string().min(1).describe("Comment text"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "contribute");
        await findTask(params.projectId, params.taskId);
        const [comment] = await db
          .insert(taskComment)
          .values({ taskId: params.taskId, authorId: ctx.userId, content: params.content })
          .returning();
        return { comment };
      })
  );

  server.tool(
    "delete_task_comment",
    "Delete a task comment. Only its author or a project manager can delete it.",
    {
      projectId: z.string().describe("Project UUID"),
      taskId: z.string().describe("Task UUID"),
      commentId: z.string().describe("Comment UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const { access } = await requireProjectAccess(ctx, params.projectId, "contribute");
        await findTask(params.projectId, params.taskId);
        const comment = await db.query.taskComment.findFirst({
          where: and(eq(taskComment.id, params.commentId), eq(taskComment.taskId, params.taskId)),
        });
        if (!comment) throw new ProjectNotFoundError("Comment");
        if (comment.authorId !== ctx.userId && access !== "manage") {
          throw new ProjectError("Can only delete your own comments", 403);
        }
        await db.delete(taskComment).where(eq(taskComment.id, params.commentId));
        return { deleted: true, commentId: params.commentId };
      })
  );

  // ─── Milestones ────────────────────────────────────────────────────────
  server.tool(
    "list_project_milestones",
    "List a project's milestones. amount and invoicedAmountCents are integer cents; invoicedAmountCents comes from invoices that are not voided or deleted. remaining = amount - invoiced.",
    {
      projectId: z.string().describe("Project UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "view");
        await syncProjectBilling(db, ctx.organizationId, [params.projectId]);
        const milestones = await db.query.projectMilestone.findMany({
          where: eq(projectMilestone.projectId, params.projectId),
          orderBy: [asc(projectMilestone.sortOrder), asc(projectMilestone.createdAt)],
        });
        return {
          milestones: milestones.map((m) => ({ ...m, remaining: Math.max(0, m.amount - m.invoicedAmountCents) })),
        };
      })
  );

  server.tool(
    "create_project_milestone",
    "Add a milestone (deliverable) to a project. amountCents is what the milestone bills, in integer cents. Needs manager access. Returns the milestone.",
    {
      projectId: z.string().describe("Project UUID"),
      title: z.string().min(1).describe("Milestone title"),
      description: z.string().optional().describe("What the milestone represents"),
      dueDate: z.string().optional().describe("Due date YYYY-MM-DD"),
      amountCents: z.number().int().min(0).optional().default(0).describe("Value in cents"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "manage");
        const [milestone] = await db
          .insert(projectMilestone)
          .values({
            projectId: params.projectId,
            title: params.title,
            description: params.description ?? null,
            dueDate: params.dueDate ?? null,
            amount: params.amountCents,
          })
          .returning();
        return { milestone };
      })
  );

  server.tool(
    "update_project_milestone",
    "Update a milestone's title, description, due date, value (cents) or status. Status completed stamps completedAt; other statuses clear it. Needs manager access.",
    {
      projectId: z.string().describe("Project UUID"),
      milestoneId: z.string().describe("Milestone UUID"),
      title: z.string().min(1).optional().describe("New title"),
      description: z.string().nullable().optional().describe("New description (null clears it)"),
      dueDate: z.string().nullable().optional().describe("Due date YYYY-MM-DD (null clears it)"),
      amountCents: z.number().int().min(0).optional().describe("New value in cents"),
      status: z.enum(MILESTONE_STATUS).optional().describe("New status"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "manage");
        const existing = await findMilestone(params.projectId, params.milestoneId);
        const updates: Partial<typeof projectMilestone.$inferInsert> = {};
        if (params.title !== undefined) updates.title = params.title;
        if (params.description !== undefined) updates.description = params.description;
        if (params.dueDate !== undefined) updates.dueDate = params.dueDate;
        if (params.amountCents !== undefined) updates.amount = params.amountCents;
        if (params.status !== undefined) {
          updates.status = params.status;
          if (params.status === "completed" && existing.status !== "completed") updates.completedAt = new Date();
          else if (params.status !== "completed") updates.completedAt = null;
        }
        if (Object.keys(updates).length === 0) throw new ProjectError("Nothing to update", 400);
        const [milestone] = await db
          .update(projectMilestone)
          .set(updates)
          .where(eq(projectMilestone.id, params.milestoneId))
          .returning();
        return { milestone };
      })
  );

  server.tool(
    "delete_project_milestone",
    "Delete a milestone and its payment assignments. Refused while the milestone is on an invoice that is not voided or deleted. Needs manager access.",
    {
      projectId: z.string().describe("Project UUID"),
      milestoneId: z.string().describe("Milestone UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "manage");
        await syncProjectBilling(db, ctx.organizationId, [params.projectId]);
        const existing = await findMilestone(params.projectId, params.milestoneId);
        if (existing.invoicedAmountCents > 0) {
          throw new ProjectError("This milestone is on an invoice. Void or delete the invoice first.", 409);
        }
        await db.delete(projectMilestone).where(eq(projectMilestone.id, params.milestoneId));
        return { deleted: true, milestoneId: params.milestoneId };
      })
  );

  server.tool(
    "list_milestone_assignments",
    "List who is paid for a milestone: each assignment has an amount in cents, an optional note and isPaid.",
    {
      projectId: z.string().describe("Project UUID"),
      milestoneId: z.string().describe("Milestone UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "view");
        await findMilestone(params.projectId, params.milestoneId);
        const assignments = await db.query.milestoneAssignment.findMany({
          where: eq(milestoneAssignment.milestoneId, params.milestoneId),
          orderBy: asc(milestoneAssignment.createdAt),
          with: {
            member: { with: { user: { columns: userColumns } } },
            employee: { columns: { id: true, name: true } },
          },
        });
        return { assignments };
      })
  );

  server.tool(
    "add_milestone_assignment",
    "Assign a team member (or payroll employee) a payment for a milestone. amountCents is integer cents. Needs manager access. Returns the assignment.",
    {
      projectId: z.string().describe("Project UUID"),
      milestoneId: z.string().describe("Milestone UUID"),
      memberId: z.string().optional().describe("Org member UUID (member.id); give this or employeeId"),
      employeeId: z.string().optional().describe("Payroll employee UUID; give this or memberId"),
      amountCents: z.number().int().min(0).describe("Amount owed in cents"),
      description: z.string().optional().describe("Optional note"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "manage");
        await findMilestone(params.projectId, params.milestoneId);
        if (!params.memberId && !params.employeeId) throw new ProjectError("Give memberId or employeeId", 400);
        if (params.memberId) await assertOrgMember(ctx, params.memberId);
        if (params.employeeId) {
          const emp = await db.query.payrollEmployee.findFirst({
            where: and(eq(payrollEmployee.id, params.employeeId), eq(payrollEmployee.organizationId, ctx.organizationId)),
            columns: { id: true },
          });
          if (!emp) throw new ProjectError("Employee not found in this organization", 400);
        }
        const [assignment] = await db
          .insert(milestoneAssignment)
          .values({
            milestoneId: params.milestoneId,
            memberId: params.memberId ?? null,
            employeeId: params.employeeId ?? null,
            amount: params.amountCents,
            description: params.description ?? null,
          })
          .returning();
        return { assignment };
      })
  );

  server.tool(
    "update_milestone_assignment",
    "Mark a milestone assignment paid or unpaid, or change its amount (cents) or note. Needs manager access. Returns the assignment.",
    {
      projectId: z.string().describe("Project UUID"),
      milestoneId: z.string().describe("Milestone UUID"),
      assignmentId: z.string().describe("Assignment UUID"),
      isPaid: z.boolean().optional().describe("true = paid"),
      amountCents: z.number().int().min(0).optional().describe("New amount in cents"),
      description: z.string().nullable().optional().describe("New note (null clears it)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "manage");
        await findMilestone(params.projectId, params.milestoneId);
        const updates: Partial<typeof milestoneAssignment.$inferInsert> = {};
        if (params.isPaid !== undefined) updates.isPaid = params.isPaid;
        if (params.amountCents !== undefined) updates.amount = params.amountCents;
        if (params.description !== undefined) updates.description = params.description;
        if (Object.keys(updates).length === 0) throw new ProjectError("Nothing to update", 400);
        const [assignment] = await db
          .update(milestoneAssignment)
          .set(updates)
          .where(and(eq(milestoneAssignment.id, params.assignmentId), eq(milestoneAssignment.milestoneId, params.milestoneId)))
          .returning();
        if (!assignment) throw new ProjectNotFoundError("Assignment");
        return { assignment };
      })
  );

  server.tool(
    "delete_milestone_assignment",
    "Remove a payment assignment from a milestone. Needs manager access.",
    {
      projectId: z.string().describe("Project UUID"),
      milestoneId: z.string().describe("Milestone UUID"),
      assignmentId: z.string().describe("Assignment UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "manage");
        await findMilestone(params.projectId, params.milestoneId);
        const [removed] = await db
          .delete(milestoneAssignment)
          .where(and(eq(milestoneAssignment.id, params.assignmentId), eq(milestoneAssignment.milestoneId, params.milestoneId)))
          .returning({ id: milestoneAssignment.id });
        if (!removed) throw new ProjectNotFoundError("Assignment");
        return { deleted: true, assignmentId: params.assignmentId };
      })
  );

  // ─── Notes ─────────────────────────────────────────────────────────────
  server.tool(
    "list_project_notes",
    "List a project's notes, newest first (pinned notes are flagged isPinned), with authors.",
    {
      projectId: z.string().describe("Project UUID"),
      pinnedOnly: z.boolean().optional().describe("Only pinned notes"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "view");
        const notes = await db.query.projectNote.findMany({
          where: and(
            eq(projectNote.projectId, params.projectId),
            params.pinnedOnly ? eq(projectNote.isPinned, true) : undefined
          ),
          orderBy: desc(projectNote.createdAt),
          with: { author: { columns: userColumns } },
        });
        return { notes };
      })
  );

  server.tool(
    "create_project_note",
    "Add a note to a project as the current user. Needs contributor access. Returns the note.",
    {
      projectId: z.string().describe("Project UUID"),
      content: z.string().min(1).describe("Note text"),
      isPinned: z.boolean().optional().default(false).describe("Pin it to the top and the Overview"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "contribute");
        const [note] = await db
          .insert(projectNote)
          .values({ projectId: params.projectId, authorId: ctx.userId, content: params.content, isPinned: params.isPinned })
          .returning();
        return { note };
      })
  );

  server.tool(
    "update_project_note",
    "Edit a note's text or pin/unpin it. Anyone who contributes can pin; only the author or a manager can change the text. Returns the note.",
    {
      projectId: z.string().describe("Project UUID"),
      noteId: z.string().describe("Note UUID"),
      content: z.string().min(1).optional().describe("New text"),
      isPinned: z.boolean().optional().describe("true = pinned"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const { access } = await requireProjectAccess(ctx, params.projectId, "contribute");
        const existing = await db.query.projectNote.findFirst({
          where: and(eq(projectNote.id, params.noteId), eq(projectNote.projectId, params.projectId)),
        });
        if (!existing) throw new ProjectNotFoundError("Note");
        if (params.content !== undefined && existing.authorId !== ctx.userId && access !== "manage") {
          throw new ProjectError("You can only edit your own notes", 403);
        }
        const updates: Partial<typeof projectNote.$inferInsert> = { updatedAt: new Date() };
        if (params.content !== undefined) updates.content = params.content;
        if (params.isPinned !== undefined) updates.isPinned = params.isPinned;
        const [note] = await db.update(projectNote).set(updates).where(eq(projectNote.id, params.noteId)).returning();
        return { note };
      })
  );

  server.tool(
    "delete_project_note",
    "Permanently delete a note. Only its author or a project manager can delete it.",
    {
      projectId: z.string().describe("Project UUID"),
      noteId: z.string().describe("Note UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const { access } = await requireProjectAccess(ctx, params.projectId, "contribute");
        const existing = await db.query.projectNote.findFirst({
          where: and(eq(projectNote.id, params.noteId), eq(projectNote.projectId, params.projectId)),
        });
        if (!existing) throw new ProjectNotFoundError("Note");
        if (existing.authorId !== ctx.userId && access !== "manage") {
          throw new ProjectError("You can only delete your own notes", 403);
        }
        await db.delete(projectNote).where(eq(projectNote.id, params.noteId));
        return { deleted: true, noteId: params.noteId };
      })
  );

  // ─── Members ─────────────────────────────────────────────────
  server.tool(
    "list_project_members",
    "List the people on a project with their project role (manager: everything; contributor: tasks, time, notes; viewer: read only), hourlyRate (billing rate override) and costRate (internal cost used for profitability), both in cents per hour (null = not set). memberId is the org member UUID used by the other member tools.",
    {
      projectId: z.string().describe("Project UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "view");
        const members = await db.query.projectMember.findMany({
          where: eq(projectMember.projectId, params.projectId),
          with: { member: { with: { user: { columns: userColumns } } } },
        });
        return {
          members: members.map((m) => ({
            memberId: m.memberId,
            role: m.role,
            hourlyRate: m.hourlyRate,
            costRate: m.costRate,
            viaTeam: !!m.teamAssignmentId,
            user: m.member.user,
          })),
        };
      })
  );

  server.tool(
    "add_project_member",
    "Add an organization member to a project with a role and optional rates (cents per hour). Needs manager access.",
    {
      projectId: z.string().describe("Project UUID"),
      memberId: z.string().describe("Org member UUID (member.id)"),
      role: z.enum(PROJECT_ROLE).optional().default("contributor").describe("Project role"),
      hourlyRateCents: z.number().int().min(0).optional().describe("Billing rate override in cents/hour; omit to use the project rate"),
      costRateCents: z.number().int().min(0).optional().describe("Internal cost in cents/hour, used for labour cost in profitability"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "manage");
        await assertOrgMember(ctx, params.memberId);
        const existing = await db.query.projectMember.findFirst({
          where: and(eq(projectMember.projectId, params.projectId), eq(projectMember.memberId, params.memberId)),
        });
        if (existing) throw new ProjectError("Member already added to this project", 400);
        const [row] = await db
          .insert(projectMember)
          .values({
            projectId: params.projectId,
            memberId: params.memberId,
            role: params.role,
            hourlyRate: params.hourlyRateCents ?? null,
            costRate: params.costRateCents ?? null,
          })
          .returning();
        return { projectMember: row };
      })
  );

  server.tool(
    "update_project_member",
    "Change a project member's role, billing rate or cost rate (cents per hour; null clears a rate). Needs manager access.",
    {
      projectId: z.string().describe("Project UUID"),
      memberId: z.string().describe("Org member UUID (member.id)"),
      role: z.enum(PROJECT_ROLE).optional().describe("New project role"),
      hourlyRateCents: z.number().int().min(0).nullable().optional().describe("Billing rate override in cents/hour (null = use the project rate)"),
      costRateCents: z.number().int().min(0).nullable().optional().describe("Internal cost in cents/hour (null = no labour cost)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "manage");
        const updates: Partial<typeof projectMember.$inferInsert> = {};
        if (params.role !== undefined) updates.role = params.role;
        if (params.hourlyRateCents !== undefined) updates.hourlyRate = params.hourlyRateCents;
        if (params.costRateCents !== undefined) updates.costRate = params.costRateCents;
        if (Object.keys(updates).length === 0) throw new ProjectError("Nothing to update", 400);
        const [row] = await db
          .update(projectMember)
          .set(updates)
          .where(and(eq(projectMember.projectId, params.projectId), eq(projectMember.memberId, params.memberId)))
          .returning();
        if (!row) throw new ProjectNotFoundError("Project member");
        return { projectMember: row };
      })
  );

  server.tool(
    "remove_project_member",
    "Take someone off a project. Their logged time stays. Needs manager access.",
    {
      projectId: z.string().describe("Project UUID"),
      memberId: z.string().describe("Org member UUID (member.id)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        await requireProjectAccess(ctx, params.projectId, "manage");
        const [removed] = await db
          .delete(projectMember)
          .where(and(eq(projectMember.projectId, params.projectId), eq(projectMember.memberId, params.memberId)))
          .returning({ id: projectMember.id });
        if (!removed) throw new ProjectNotFoundError("Project member");
        return { removed: true, memberId: params.memberId };
      })
  );

  // ─── Invoicing ─────────────────────────────────────────────────────────
  server.tool(
    "get_project_uninvoiced_work",
    "What can still be invoiced on a project, by its billing type. hourly: unbilled billable timeEntries (minutes, hourlyRate and amount in cents). milestone: milestones with amount, invoicedAmountCents and remaining (cents). fixed: fixedPrice, totalInvoiced, remaining (cents) and invoicedPercent. Every type also lists billableExpenses (registered, not yet billed; billableAmount includes markup). Work on voided or deleted invoices counts as uninvoiced again.",
    {
      projectId: z.string().describe("Project UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const { project: proj } = await requireProjectAccess(ctx, params.projectId, "view");
        return getProjectUninvoiced(ctx, proj);
      })
  );

  server.tool(
    "create_project_progress_invoice",
    "Create a DRAFT invoice for project work, following the project's billing type: hourly projects bill the given timeEntryIds; milestone projects bill the remaining amount of each milestoneIds entry; fixed price projects bill percentageToInvoice percent of the fixed price (capped at what is left). Billable expenses can be added on any type. Non-billable projects are refused, and the project needs a client contact. Lines are tagged with the project; voiding or deleting the invoice releases the work again. Nothing is posted to the ledger until the invoice is approved/sent. Needs manager access. Returns the invoice (amounts in cents).",
    {
      projectId: z.string().describe("Project UUID"),
      timeEntryIds: z.array(z.string()).optional().describe("Hourly projects: unbilled billable time entry UUIDs to bill"),
      milestoneIds: z.array(z.string()).optional().describe("Milestone projects: milestone UUIDs to bill (their remaining amount)"),
      percentageToInvoice: z.number().min(0).max(100).optional().describe("Fixed price projects: percent of the fixed price to bill"),
      includeBillableExpenses: z.boolean().optional().default(false).describe("Also bill registered, not-yet-billed billable expenses"),
      billableItemIds: z.array(z.string()).optional().describe("Only these billable expense UUIDs (default: all registered ones)"),
      defaultExpenseMarkupBasisPoints: z.number().int().min(0).optional().default(0).describe("Markup in basis points (1000 = 10%) for expenses whose own markup is 0"),
      issueDate: z.string().optional().describe("Issue date YYYY-MM-DD (default today)"),
      dueDate: z.string().optional().describe("Due date YYYY-MM-DD (default issue + 30 days)"),
      notes: z.string().optional().describe("Notes printed on the invoice"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const { project: proj } = await requireProjectAccess(ctx, params.projectId, "manage");
        const { projectId: _projectId, ...input } = params;
        void _projectId;
        const inv = await createProjectInvoice(ctx, proj, input);
        return { invoice: inv };
      })
  );

  server.tool(
    "invoice_project_unbilled",
    "Create a DRAFT invoice for everything unbilled on a project: for hourly projects every unbilled billable time entry, plus registered billable expenses (any billing type). Fixed price and milestone work is not included here; use create_project_progress_invoice for that. Needs manager access and a client contact. Returns the invoice (amounts in cents).",
    {
      projectId: z.string().describe("Project UUID"),
      includeBillableExpenses: z.boolean().optional().default(true).describe("Also bill registered billable expenses"),
      issueDate: z.string().optional().describe("Issue date YYYY-MM-DD (default today)"),
      dueDate: z.string().optional().describe("Due date YYYY-MM-DD (default issue + 30 days)"),
      notes: z.string().optional().describe("Notes printed on the invoice"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const { project: proj } = await requireProjectAccess(ctx, params.projectId, "manage");
        const inv = await createProjectInvoice(ctx, proj, {
          allUnbilledTime: proj.billingType === "hourly",
          includeBillableExpenses: params.includeBillableExpenses,
          issueDate: params.issueDate,
          dueDate: params.dueDate,
          notes: params.notes,
        });
        return { invoice: inv };
      })
  );
}

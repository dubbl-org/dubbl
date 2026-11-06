import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { db } from "@/lib/db";
import { contact, deal, dealActivity, pipeline } from "@/lib/db/schema";
import {
  eq,
  and,
  asc,
  desc,
  isNull,
  isNotNull,
  ilike,
  count,
  inArray,
  lt,
  gte,
} from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { logAudit } from "@/lib/api/audit";
import type { AuthContext } from "@/lib/api/auth-context";
import { wrapTool } from "@/lib/mcp/errors";
import {
  CRM_PERMISSION,
  CrmError,
  applyPipelineStages,
  assertOrgUser,
  assertStageInPipeline,
  clearOtherDefaults,
  computeCrmAnalytics,
  deletePipelineMovingDeals,
  findDeal,
  findPipeline,
  moveDealToStage,
} from "@/lib/api/crm-deals";
import { LOST_STAGE, WON_STAGE, dealStageChange, normalizePipelineStages } from "@/lib/crm/rules";

/**
 * MCP tools for the CRM: sales pipelines, deals and their lifecycle
 * (create -> move between stages -> won / lost), plus deal activities
 * (notes, emails, calls, meetings, tasks).
 *
 * A deal's monetary value (`valueCents`) is in integer cents (e.g. $12.50 =
 * 1250). Direct DB access via Drizzle (no HTTP self-calls); every query is
 * org-scoped via the AuthContext and excludes soft-deleted rows where the
 * table supports it. Permission gates mirror the matching REST routes: every
 * change to deals, activities and pipelines needs the "manage:contacts"
 * permission; reading needs none.
 */
export function registerCrmTools(server: McpServer, ctx: AuthContext) {
  // --- Pipelines ---

  server.tool(
    "list_pipelines",
    "List all sales pipelines for the organization, ordered by creation time. Each pipeline carries its ordered stage configuration (id, name, color) used as the stageId of deals. Excludes deleted pipelines.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const pipelines = await db.query.pipeline.findMany({
          where: and(
            eq(pipeline.organizationId, ctx.organizationId),
            notDeleted(pipeline.deletedAt)
          ),
          orderBy: pipeline.createdAt,
        });
        return { pipelines };
      })
  );

  server.tool(
    "get_pipeline",
    "Get a single sales pipeline by ID, including its stage configuration and all deals currently in it. Excludes deleted pipelines.",
    {
      pipelineId: z.string().describe("The UUID of the pipeline"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.pipeline.findFirst({
          where: and(
            eq(pipeline.id, params.pipelineId),
            eq(pipeline.organizationId, ctx.organizationId),
            notDeleted(pipeline.deletedAt)
          ),
          with: { deals: true },
        });
        if (!found) throw new Error("Pipeline not found");
        return { pipeline: found };
      })
  );

  // --- Deals ---

  server.tool(
    "list_deals",
    "List deals with optional filtering by pipeline, stage, source, status (active/won/lost) and a title search, plus pagination and sorting. valueCents is in integer cents. Returns the paginated deals (each with its contact and assigned user) and a summary across the (optionally pipeline-scoped) deals: active/won counts and values and per-stage distribution. Excludes deleted deals.",
    {
      pipelineId: z.string().optional().describe("Filter to a single pipeline by UUID"),
      stageId: z
        .string()
        .optional()
        .describe("Filter to a single stage (the stageId, e.g. 'lead', 'qualified')"),
      source: z
        .enum(["website", "referral", "cold_outreach", "event", "other"])
        .optional()
        .describe("Filter by lead source"),
      status: z
        .enum(["active", "won", "lost"])
        .optional()
        .describe(
          "Filter by lifecycle status: 'active' (neither won nor lost), 'won', or 'lost'"
        ),
      search: z.string().optional().describe("Case-insensitive search on the deal title"),
      sortBy: z
        .enum(["created", "value", "name", "probability"])
        .optional()
        .default("created")
        .describe("Sort field: created (default), value, name (title), or probability"),
      sortOrder: z
        .enum(["asc", "desc"])
        .optional()
        .default("desc")
        .describe("Sort direction (default desc)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of deals to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(deal.organizationId, ctx.organizationId),
          notDeleted(deal.deletedAt),
        ];
        if (params.pipelineId) conditions.push(eq(deal.pipelineId, params.pipelineId));
        if (params.stageId) conditions.push(eq(deal.stageId, params.stageId));
        if (params.source) conditions.push(eq(deal.source, params.source));
        if (params.search) conditions.push(ilike(deal.title, `%${params.search}%`));
        if (params.status === "active") {
          conditions.push(isNull(deal.wonAt));
          conditions.push(isNull(deal.lostAt));
        } else if (params.status === "won") {
          conditions.push(isNotNull(deal.wonAt));
        } else if (params.status === "lost") {
          conditions.push(isNotNull(deal.lostAt));
        }

        const orderFn = params.sortOrder === "asc" ? asc : desc;
        let orderCol;
        switch (params.sortBy) {
          case "value":
            orderCol = deal.valueCents;
            break;
          case "name":
            orderCol = deal.title;
            break;
          case "probability":
            orderCol = deal.probability;
            break;
          default:
            orderCol = deal.createdAt;
        }

        const all = await db.query.deal.findMany({
          where: and(...conditions),
          with: { contact: true, assignedUser: { columns: { id: true, name: true, email: true } } },
          orderBy: orderFn(orderCol),
        });

        const total = all.length;
        const offset = (params.page - 1) * params.limit;
        const data = all.slice(offset, offset + params.limit);

        // Summary stats computed from unfiltered deals (optionally pipeline-scoped).
        const allDeals = await db.query.deal.findMany({
          where: and(
            eq(deal.organizationId, ctx.organizationId),
            notDeleted(deal.deletedAt),
            ...(params.pipelineId ? [eq(deal.pipelineId, params.pipelineId)] : [])
          ),
        });

        const activeDeals = allDeals.filter((d) => !d.wonAt && !d.lostAt);
        const activeCount = activeDeals.length;
        const activeValue = activeDeals.reduce((s, d) => s + d.valueCents, 0);
        const wonCount = allDeals.filter((d) => d.wonAt).length;
        const wonValue = allDeals
          .filter((d) => d.wonAt)
          .reduce((s, d) => s + d.valueCents, 0);

        const stageDistribution: Record<string, { count: number; value: number }> = {};
        for (const d of activeDeals) {
          if (!stageDistribution[d.stageId])
            stageDistribution[d.stageId] = { count: 0, value: 0 };
          stageDistribution[d.stageId].count++;
          stageDistribution[d.stageId].value += d.valueCents;
        }

        return {
          deals: data,
          total,
          page: params.page,
          limit: params.limit,
          summary: {
            activeCount,
            activeValue,
            wonCount,
            wonValue,
            totalDeals: allDeals.length,
            stageDistribution,
          },
        };
      })
  );

  server.tool(
    "get_deal",
    "Get a single deal by ID with its contact, owner (assignedUser), pipeline and activities (newest first, each with the user who logged it). valueCents is in integer cents. Excludes deleted deals.",
    {
      dealId: z.string().describe("The UUID of the deal"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.deal.findFirst({
          where: and(
            eq(deal.id, params.dealId),
            eq(deal.organizationId, ctx.organizationId),
            notDeleted(deal.deletedAt)
          ),
          with: {
            contact: true,
            assignedUser: { columns: { id: true, name: true, email: true } },
            activities: {
              with: { user: { columns: { id: true, name: true, email: true } } },
              orderBy: (a, { desc: d }) => [d(a.createdAt)],
            },
            pipeline: true,
          },
        });
        if (!found) throw new CrmError("Deal not found", 404);
        return { deal: found };
      })
  );

  server.tool(
    "create_deal",
    "Create a new deal in a pipeline stage. stageId must be one of the pipeline's stages. valueCents is the deal value in integer cents (e.g. 1250 = $12.50), defaulting to 0. probability is a win likelihood 0-100. assignedTo (the owner) must be a user in this organization. Creating it in 'closed_won' or 'closed_lost' closes it straight away; otherwise it starts open. Requires the manage:contacts permission. Returns the created deal.",
    {
      pipelineId: z.string().describe("UUID of the pipeline this deal belongs to"),
      stageId: z
        .string()
        .describe("The stage id within the pipeline (e.g. 'lead', 'qualified')"),
      title: z.string().min(1).describe("Deal title / short name"),
      contactId: z
        .string()
        .nullable()
        .optional()
        .describe("UUID of the associated contact, or null for none"),
      valueCents: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Deal value in integer cents (e.g. 1250 = $12.50); defaults to 0"),
      currency: currencyCodeSchema
        .optional()
        .describe("ISO 4217 currency code for the deal value; defaults to USD"),
      probability: z
        .number()
        .int()
        .min(0)
        .max(100)
        .nullable()
        .optional()
        .describe("Win probability as a percentage 0-100, or null for unknown"),
      expectedCloseDate: z
        .string()
        .nullable()
        .optional()
        .describe("Expected close date (YYYY-MM-DD), or null"),
      assignedTo: z
        .string()
        .nullable()
        .optional()
        .describe("UUID of the user the deal is assigned to, or null"),
      source: z
        .enum(["website", "referral", "cold_outreach", "event", "other"])
        .nullable()
        .optional()
        .describe("Lead source, or null"),
      notes: z.string().nullable().optional().describe("Free-text notes, or null"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, CRM_PERMISSION);
        const p = await findPipeline(ctx, params.pipelineId);
        assertStageInPipeline(p, params.stageId);
        await assertOrgUser(ctx, params.assignedTo);
        const closed = dealStageChange({ stageId: "", wonAt: null, lostAt: null, probability: null }, params.stageId);
        const [created] = await db
          .insert(deal)
          .values({
            organizationId: ctx.organizationId,
            pipelineId: params.pipelineId,
            stageId: params.stageId,
            title: params.title,
            contactId: params.contactId ?? null,
            valueCents: params.valueCents,
            currency: params.currency,
            probability: params.probability,
            expectedCloseDate: params.expectedCloseDate ?? null,
            assignedTo: params.assignedTo ?? null,
            source: params.source ?? null,
            notes: params.notes ?? null,
            ...(closed.wonAt || closed.lostAt ? closed : {}),
          })
          .returning();

        await logAudit({
          ctx,
          action: "create",
          entityType: "deal",
          entityId: created.id,
        });

        return { deal: created };
      })
  );

  server.tool(
    "update_deal",
    "Update an existing deal's editable fields: title, value, probability, expected close, owner, contact, source and notes. Only provided fields are changed; null clears a field. valueCents is in integer cents; probability is 0-100. This does NOT move the deal between stages (use move_deal_stage) and does NOT mark it won/lost. Requires the manage:contacts permission. Returns the updated deal.",
    {
      dealId: z.string().describe("The UUID of the deal to update"),
      title: z.string().min(1).optional().describe("New deal title"),
      valueCents: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("New deal value in integer cents (e.g. 1250 = $12.50)"),
      probability: z
        .number()
        .int()
        .min(0)
        .max(100)
        .nullable()
        .optional()
        .describe("New win probability as a percentage 0-100, or null to clear"),
      expectedCloseDate: z
        .string()
        .nullable()
        .optional()
        .describe("New expected close date (YYYY-MM-DD), or null to clear"),
      assignedTo: z
        .string()
        .nullable()
        .optional()
        .describe("New assignee user UUID, or null to unassign"),
      notes: z.string().nullable().optional().describe("New notes, or null to clear"),
      contactId: z
        .string()
        .nullable()
        .optional()
        .describe("New associated contact UUID, or null to clear"),
      source: z
        .enum(["website", "referral", "cold_outreach", "event", "other"])
        .nullable()
        .optional()
        .describe("New lead source, or null to clear"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, CRM_PERMISSION);
        await findDeal(ctx, params.dealId);
        await assertOrgUser(ctx, params.assignedTo);
        if (params.contactId) {
          const c = await db.query.contact.findFirst({
            where: and(eq(contact.id, params.contactId), eq(contact.organizationId, ctx.organizationId)),
            columns: { id: true },
          });
          if (!c) throw new CrmError("Contact not found", 404);
        }

        const { dealId, ...updates } = params;
        const cleanUpdates = Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined)
        );

        const [updated] = await db
          .update(deal)
          .set({ ...cleanUpdates, updatedAt: new Date() })
          .where(
            and(eq(deal.id, dealId), eq(deal.organizationId, ctx.organizationId))
          )
          .returning();

        await logAudit({
          ctx,
          action: "update",
          entityType: "deal",
          entityId: dealId,
        });

        return { deal: updated };
      })
  );

  server.tool(
    "move_deal_stage",
    "Move a deal to another stage of its pipeline. Moving to 'closed_won' or 'closed_lost' closes the deal exactly like mark_deal_won / mark_deal_lost (reason is used for lost). Moving a closed deal to an open stage reopens it (clears won/lost and probability). Requires the manage:contacts permission. Returns the updated deal.",
    {
      dealId: z.string().describe("The UUID of the deal to move"),
      stageId: z
        .string()
        .describe("The destination stage id within the pipeline (e.g. 'qualified', 'closed_won')"),
      reason: z
        .string()
        .nullable()
        .optional()
        .describe("Why the deal was lost; only used when stageId is 'closed_lost'"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, CRM_PERMISSION);
        const { before, deal: updated } = await moveDealToStage(ctx, params.dealId, params.stageId, { reason: params.reason });

        await logAudit({
          ctx,
          action: "change_stage",
          entityType: "deal",
          entityId: params.dealId,
          changes: { previousStatus: before.stageId, stageId: params.stageId },
        });

        return { deal: updated };
      })
  );

  server.tool(
    "mark_deal_won",
    "Mark a deal as won. Sets its stage to 'closed_won', records the won timestamp, clears any lost state and sets probability to 100. Requires the manage:contacts permission. Returns the updated deal.",
    {
      dealId: z.string().describe("The UUID of the deal to mark as won"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, CRM_PERMISSION);
        const { before: found, deal: updated } = await moveDealToStage(ctx, params.dealId, WON_STAGE);

        await logAudit({
          ctx,
          action: "won",
          entityType: "deal",
          entityId: params.dealId,
          changes: { previousStatus: found.stageId },
        });

        return { deal: updated };
      })
  );

  server.tool(
    "mark_deal_lost",
    "Mark a deal as lost. Sets its stage to 'closed_lost', records the lost timestamp and an optional lost reason (shown in CRM analytics), clears any won state and sets probability to 0. Requires the manage:contacts permission. Returns the updated deal.",
    {
      dealId: z.string().describe("The UUID of the deal to mark as lost"),
      reason: z
        .string()
        .nullable()
        .optional()
        .describe("Optional reason the deal was lost"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, CRM_PERMISSION);
        const { before: found, deal: updated } = await moveDealToStage(ctx, params.dealId, LOST_STAGE, { reason: params.reason });

        await logAudit({
          ctx,
          action: "lost",
          entityType: "deal",
          entityId: params.dealId,
          changes: { previousStatus: found.stageId },
        });

        return { deal: updated };
      })
  );

  // --- Deal activities ---

  server.tool(
    "list_deal_activities",
    "List the activity timeline (notes, emails, calls, meetings, tasks) for a deal, with optional type filter and content search, plus pagination and sorting. Returns the activities (each with its user), pagination, per-type counts and the total activity count for the deal.",
    {
      dealId: z.string().describe("The UUID of the deal whose activities to list"),
      type: z
        .enum(["note", "email", "call", "meeting", "task"])
        .optional()
        .describe("Filter by activity type"),
      search: z
        .string()
        .optional()
        .describe("Case-insensitive search on activity content"),
      sortBy: z
        .enum(["date", "type"])
        .optional()
        .default("date")
        .describe("Sort field: date (createdAt, default) or type"),
      sortOrder: z
        .enum(["asc", "desc"])
        .optional()
        .default("desc")
        .describe("Sort direction (default desc)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(30)
        .describe("Number of activities to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        // Verify the deal belongs to the org (route does not require notDeleted here).
        const d = await db.query.deal.findFirst({
          where: and(
            eq(deal.id, params.dealId),
            eq(deal.organizationId, ctx.organizationId)
          ),
        });
        if (!d) throw new Error("Deal not found");

        const conditions = [eq(dealActivity.dealId, params.dealId)];
        if (params.type) conditions.push(eq(dealActivity.type, params.type));
        if (params.search)
          conditions.push(ilike(dealActivity.content, `%${params.search}%`));
        const where = and(...conditions);

        const orderFn = params.sortOrder === "asc" ? asc : desc;
        const orderCol =
          params.sortBy === "type" ? dealActivity.type : dealActivity.createdAt;

        const [{ total }] = await db
          .select({ total: count() })
          .from(dealActivity)
          .where(where);

        const typeCounts = await db
          .select({ type: dealActivity.type, count: count() })
          .from(dealActivity)
          .where(eq(dealActivity.dealId, params.dealId))
          .groupBy(dealActivity.type);

        const counts: Record<string, number> = {};
        for (const row of typeCounts) counts[row.type] = row.count;

        const offset = (params.page - 1) * params.limit;
        const activities = await db.query.dealActivity.findMany({
          where,
          with: { user: { columns: { id: true, name: true, email: true } } },
          orderBy: orderFn(orderCol),
          limit: params.limit,
          offset,
        });

        const totalPages = Math.ceil(total / params.limit);
        const totalAll = typeCounts.reduce((sum, r) => sum + r.count, 0);

        return {
          activities,
          pagination: { page: params.page, limit: params.limit, total, totalPages },
          typeCounts: counts,
          totalAll,
        };
      })
  );

  server.tool(
    "add_deal_activity",
    "Log an activity (note, email, call, meeting or task) against a deal. The activity is attributed to the current user. Provide scheduledAt (ISO date-time) to plan it: it then shows as 'Coming up' or 'Overdue' until marked done with complete_deal_activity. Requires the manage:contacts permission. Returns the created activity.",
    {
      dealId: z.string().describe("The UUID of the deal to add the activity to"),
      type: z
        .enum(["note", "email", "call", "meeting", "task"])
        .describe("The activity type"),
      content: z
        .string()
        .nullable()
        .optional()
        .describe("The activity body/content, or null"),
      scheduledAt: z
        .string()
        .nullable()
        .optional()
        .describe("ISO 8601 date-time the activity is scheduled for, or null"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, CRM_PERMISSION);
        await findDeal(ctx, params.dealId);
        if (params.scheduledAt && Number.isNaN(new Date(params.scheduledAt).getTime())) {
          throw new CrmError("scheduledAt must be an ISO date-time", 400);
        }

        const [activity] = await db
          .insert(dealActivity)
          .values({
            dealId: params.dealId,
            userId: ctx.userId,
            type: params.type,
            content: params.content || null,
            scheduledAt: params.scheduledAt ? new Date(params.scheduledAt) : null,
          })
          .returning();

        return { activity };
      })
  );

  // --- Cross-deal activity feed ---

  server.tool(
    "list_all_deal_activities",
    "List deal activities across every deal in the workspace (the CRM activity feed), newest first. Filter by type, by deal, by content search, and by status: 'planned' (scheduled, not done), 'overdue' (scheduled in the past, not done), 'upcoming' (scheduled in the future, not done), 'done' (marked complete) or 'logged' (never scheduled, not done). Returns activities with the user who logged them and their deal (title, valueCents in integer cents, currency, stage, contact name), plus pagination.",
    {
      type: z.enum(["note", "email", "call", "meeting", "task"]).optional().describe("Only this activity type"),
      status: z.enum(["planned", "overdue", "upcoming", "done", "logged"]).optional().describe("Only activities in this state"),
      dealId: z.string().uuid().optional().describe("Only activities on this deal (UUID)"),
      search: z.string().optional().describe("Case-insensitive search in the activity content"),
      limit: z.number().int().min(1).max(100).optional().default(50).describe("Activities per page (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const orgDeals = db
          .select({ id: deal.id })
          .from(deal)
          .where(and(eq(deal.organizationId, ctx.organizationId), notDeleted(deal.deletedAt)));
        const conditions = [inArray(dealActivity.dealId, orgDeals)];
        if (params.type) conditions.push(eq(dealActivity.type, params.type));
        if (params.dealId) conditions.push(eq(dealActivity.dealId, params.dealId));
        if (params.search) conditions.push(ilike(dealActivity.content, `%${params.search}%`));
        const now = new Date();
        if (params.status === "done") conditions.push(isNotNull(dealActivity.completedAt));
        else if (params.status === "planned") conditions.push(isNotNull(dealActivity.scheduledAt), isNull(dealActivity.completedAt));
        else if (params.status === "overdue") conditions.push(lt(dealActivity.scheduledAt, now), isNull(dealActivity.completedAt));
        else if (params.status === "upcoming") conditions.push(gte(dealActivity.scheduledAt, now), isNull(dealActivity.completedAt));
        else if (params.status === "logged") conditions.push(isNull(dealActivity.scheduledAt), isNull(dealActivity.completedAt));
        const where = and(...conditions);

        const [{ total }] = await db.select({ total: count() }).from(dealActivity).where(where);
        const activities = await db.query.dealActivity.findMany({
          where,
          orderBy: desc(dealActivity.createdAt),
          limit: params.limit,
          offset: (params.page - 1) * params.limit,
          with: {
            user: { columns: { id: true, name: true, email: true } },
            deal: {
              columns: { id: true, title: true, valueCents: true, currency: true, stageId: true, pipelineId: true, wonAt: true, lostAt: true },
              with: { contact: { columns: { id: true, name: true } } },
            },
          },
        });
        return {
          activities,
          pagination: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
        };
      })
  );

  /** Activity by id, only when its deal is in this workspace. */
  async function findOrgActivity(activityId: string) {
    const [row] = await db
      .select({ activity: dealActivity })
      .from(dealActivity)
      .innerJoin(deal, eq(deal.id, dealActivity.dealId))
      .where(and(eq(dealActivity.id, activityId), eq(deal.organizationId, ctx.organizationId), notDeleted(deal.deletedAt)))
      .limit(1);
    if (!row) throw new CrmError("Activity not found", 404);
    return row.activity;
  }

  server.tool(
    "complete_deal_activity",
    "Mark a deal activity (usually a task, call or meeting that was planned) as done, or set it back to not done. Requires the manage:contacts permission. Returns the updated activity with its completedAt time (null when not done).",
    {
      activityId: z.string().uuid().describe("The UUID of the deal activity"),
      completed: z.boolean().optional().default(true).describe("true to mark done (default), false to mark not done yet"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, CRM_PERMISSION);
        await findOrgActivity(params.activityId);
        const [activity] = await db
          .update(dealActivity)
          .set({ completedAt: params.completed ? new Date() : null })
          .where(eq(dealActivity.id, params.activityId))
          .returning();
        logAudit({ ctx, action: "update", entityType: "deal_activity", entityId: params.activityId, changes: { completed: params.completed } });
        return { activity };
      })
  );

  server.tool(
    "delete_deal_activity",
    "Permanently delete one activity from a deal's history. Requires the manage:contacts permission. Returns { success: true }.",
    {
      activityId: z.string().uuid().describe("The UUID of the deal activity to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, CRM_PERMISSION);
        const existing = await findOrgActivity(params.activityId);
        await db.delete(dealActivity).where(eq(dealActivity.id, params.activityId));
        logAudit({ ctx, action: "delete", entityType: "deal_activity", entityId: params.activityId, changes: existing as Record<string, unknown> });
        return { success: true };
      })
  );

  server.tool(
    "delete_deal",
    "Delete a deal. It moves to Trash with its activities and disappears from the pipeline, lists and analytics; it can be restored from Trash (restore_trash_item) within 30 days. Requires the manage:contacts permission. Returns { success: true }.",
    {
      dealId: z.string().uuid().describe("The UUID of the deal to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, CRM_PERMISSION);
        const [deleted] = await db
          .update(deal)
          .set(softDelete())
          .where(and(eq(deal.id, params.dealId), eq(deal.organizationId, ctx.organizationId), notDeleted(deal.deletedAt)))
          .returning();
        if (!deleted) throw new CrmError("Deal not found", 404);
        logAudit({ ctx, action: "delete", entityType: "deal", entityId: params.dealId, changes: deleted as Record<string, unknown> });
        return { success: true };
      })
  );

  server.tool(
    "get_crm_analytics",
    "Get CRM pipeline analytics for the organization (what the CRM Analytics page shows): totalDeals, openDeals, wonDeals, lostDeals, totalPipelineValue (open deals) and wonValue in integer cents, conversionRate (won / (won + lost), percent), avgDealValue (average won deal, cents), stageDistribution keyed by stage id with { name, count, value }, and lostReasons [{ reason, count, value }] most common first. Takes no input.",
    {},
    () => wrapTool(ctx, async () => computeCrmAnalytics(ctx))
  );

  // --- Pipeline management ---

  const stageSchema = z.object({
    id: z.string().min(1).describe("Stable stage id stored on deals, e.g. 'lead'. Use 'closed_won' and 'closed_lost' for the outcome stages"),
    name: z.string().min(1).describe("Stage name shown on the board, e.g. 'Proposal sent'"),
    color: z.string().describe("Hex colour for the stage, e.g. '#3b82f6'"),
  });

  server.tool(
    "create_pipeline",
    "Create a sales pipeline with its ordered stages. Deals move through the open stages left to right. The 'closed_won' (Won) and 'closed_lost' (Lost) stages are always kept at the end; they are added if missing. The first pipeline becomes the default; set isDefault to make another one the default (only one pipeline is ever the default). Requires the manage:contacts permission. Returns the created pipeline.",
    {
      name: z.string().min(1).describe("Pipeline name, e.g. 'New business'"),
      stages: z.array(stageSchema).min(1).describe("Ordered list of stages"),
      isDefault: z.boolean().optional().describe("Make this the default pipeline"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, CRM_PERMISSION);
        const created = await db.transaction(async (tx) => {
          const existing = await tx.query.pipeline.findFirst({
            where: and(eq(pipeline.organizationId, ctx.organizationId), notDeleted(pipeline.deletedAt)),
            columns: { id: true },
          });
          const [row] = await tx
            .insert(pipeline)
            .values({
              organizationId: ctx.organizationId,
              name: params.name,
              stages: normalizePipelineStages(params.stages),
              isDefault: params.isDefault ?? !existing,
            })
            .returning();
          if (row.isDefault) await clearOtherDefaults(tx, ctx.organizationId, row.id);
          return row;
        });
        logAudit({ ctx, action: "create", entityType: "pipeline", entityId: created.id });
        return { pipeline: created };
      })
  );

  server.tool(
    "update_pipeline",
    "Rename a pipeline, replace its ordered stages (to add, remove, rename, recolour or reorder them), or make it the default (the previous default is cleared). Only provided fields change. Deals keep their stage id, so keep ids stable when renaming a stage. The Won and Lost stages can't be removed (they are re-added at the end), and deals in a removed stage move to the first open stage. Requires the manage:contacts permission. Returns the updated pipeline and how many deals moved.",
    {
      pipelineId: z.string().uuid().describe("The UUID of the pipeline"),
      name: z.string().min(1).optional().describe("New pipeline name"),
      stages: z.array(stageSchema).min(1).optional().describe("The full new ordered list of stages"),
      isDefault: z.boolean().optional().describe("Make this the default pipeline"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, CRM_PERMISSION);
        const existing = await findPipeline(ctx, params.pipelineId);
        if (params.isDefault === false && existing.isDefault) {
          throw new CrmError("Set another pipeline as the default instead", 400);
        }
        const updates: Partial<typeof pipeline.$inferInsert> = {};
        let movedDeals = 0;
        const updated = await db.transaction(async (tx) => {
          if (params.name !== undefined) updates.name = params.name;
          if (params.isDefault !== undefined) updates.isDefault = params.isDefault;
          if (params.stages !== undefined) {
            const applied = await applyPipelineStages(tx, ctx.organizationId, params.pipelineId, params.stages);
            updates.stages = applied.stages;
            movedDeals = applied.movedDeals;
          }
          const [row] = await tx
            .update(pipeline)
            .set(updates)
            .where(and(eq(pipeline.id, params.pipelineId), eq(pipeline.organizationId, ctx.organizationId), notDeleted(pipeline.deletedAt)))
            .returning();
          if (row?.isDefault) await clearOtherDefaults(tx, ctx.organizationId, row.id);
          return row;
        });
        if (!updated) throw new CrmError("Pipeline not found", 404);
        logAudit({ ctx, action: "update", entityType: "pipeline", entityId: params.pipelineId, changes: updates as Record<string, unknown> });
        return { pipeline: updated, movedDeals };
      })
  );

  server.tool(
    "delete_pipeline",
    "Delete a sales pipeline. Its deals are not deleted: they move to the default pipeline (or the oldest other one), open deals into a stage that exists there, and that pipeline becomes the default if this one was. Refused when it is the only pipeline and still has deals. Requires the manage:contacts permission. Returns { success, movedDeals, movedTo }.",
    {
      pipelineId: z.string().uuid().describe("The UUID of the pipeline to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, CRM_PERMISSION);
        const { pipeline: deleted, movedDeals, movedTo } = await deletePipelineMovingDeals(ctx, params.pipelineId);
        logAudit({ ctx, action: "delete", entityType: "pipeline", entityId: params.pipelineId, changes: { ...(deleted as Record<string, unknown>), movedDeals } });
        return { success: true, movedDeals, movedTo };
      })
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { compensationBand, compensationReview, compensationReviewEntry } from "@/lib/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { logAudit } from "@/lib/api/audit";
import { wrapTool } from "@/lib/mcp/errors";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { AuthError, type AuthContext } from "@/lib/api/auth-context";
import {
  addReviewEntry,
  removeReviewEntry,
  updateReviewStatus,
} from "@/lib/api/compensation-reviews";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function registerCompensationTools(server: McpServer, ctx: AuthContext) {
  // ─── Bands ────────────────────────────────────────────────────────
  server.tool(
    "list_compensation_bands",
    "List the organization's compensation (salary) bands. Each band has name, level, minSalary/midSalary/maxSalary (annual, integer cents), currency and isActive.",
    {},
    () =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:compensation");
        const bands = await db.query.compensationBand.findMany({
          where: and(
            eq(compensationBand.organizationId, ctx.organizationId),
            notDeleted(compensationBand.deletedAt)
          ),
        });
        return { bands };
      })
  );

  server.tool(
    "create_compensation_band",
    "Create a compensation band: an annual salary range for a role or level. All salaries are annual amounts in integer cents (e.g. $90,000 = 9000000) and must satisfy min <= mid <= max. Returns the created band.",
    {
      name: z.string().min(1).describe("Band name, e.g. 'Software Engineer'"),
      level: z.string().optional().describe("Level label, e.g. 'L3' or 'Senior' (optional)"),
      minSalary: z.number().int().min(0).describe("Minimum annual salary in integer cents"),
      midSalary: z.number().int().min(0).describe("Midpoint annual salary in integer cents"),
      maxSalary: z.number().int().min(0).describe("Maximum annual salary in integer cents"),
      currency: currencyCodeSchema.optional().describe("ISO 4217 currency code, defaults to USD"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:compensation");
        if (!(params.minSalary <= params.midSalary && params.midSalary <= params.maxSalary)) {
          throw new AuthError("Salaries must be in order: min <= mid <= max", 422);
        }
        const [band] = await db
          .insert(compensationBand)
          .values({ organizationId: ctx.organizationId, ...params })
          .returning();
        await logAudit({ ctx, action: "create", entityType: "compensationBand", entityId: band.id });
        return { band };
      })
  );

  server.tool(
    "update_compensation_band",
    "Update a compensation band. Pass only the fields to change. Salaries are annual amounts in integer cents. Returns the updated band.",
    {
      bandId: z.string().uuid().describe("Band id (from list_compensation_bands)"),
      name: z.string().min(1).optional().describe("New name"),
      level: z.string().nullable().optional().describe("New level label, or null to clear"),
      minSalary: z.number().int().min(0).optional().describe("New minimum annual salary in integer cents"),
      midSalary: z.number().int().min(0).optional().describe("New midpoint annual salary in integer cents"),
      maxSalary: z.number().int().min(0).optional().describe("New maximum annual salary in integer cents"),
      currency: currencyCodeSchema.optional().describe("New ISO 4217 currency code"),
      isActive: z.boolean().optional().describe("false to deactivate the band"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:compensation");
        const { bandId, ...changes } = params;
        const [band] = await db
          .update(compensationBand)
          .set(changes)
          .where(and(
            eq(compensationBand.id, bandId),
            eq(compensationBand.organizationId, ctx.organizationId),
            notDeleted(compensationBand.deletedAt)
          ))
          .returning();
        if (!band) throw new AuthError("Compensation band not found", 404);
        await logAudit({ ctx, action: "update", entityType: "compensationBand", entityId: bandId, changes });
        return { band };
      })
  );

  server.tool(
    "delete_compensation_band",
    "Delete a compensation band (soft delete; it can be restored from trash). Returns { success: true }.",
    {
      bandId: z.string().uuid().describe("Band id to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:compensation");
        const [deleted] = await db
          .update(compensationBand)
          .set(softDelete())
          .where(and(
            eq(compensationBand.id, params.bandId),
            eq(compensationBand.organizationId, ctx.organizationId),
            notDeleted(compensationBand.deletedAt)
          ))
          .returning();
        if (!deleted) throw new AuthError("Compensation band not found", 404);
        await logAudit({ ctx, action: "delete", entityType: "compensationBand", entityId: params.bandId });
        return { success: true };
      })
  );

  // ─── Reviews ──────────────────────────────────────────────────────
  server.tool(
    "list_compensation_reviews",
    "List compensation (pay) reviews, newest first. Each review has name, effectiveDate, status (draft, in_progress, completed, cancelled), totalBudget (integer cents or null) and entryCount.",
    {
      status: z
        .enum(["draft", "in_progress", "completed", "cancelled"])
        .optional()
        .describe("Only reviews with this status. Omit for all."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:compensation");
        const conditions = [
          eq(compensationReview.organizationId, ctx.organizationId),
          notDeleted(compensationReview.deletedAt),
        ];
        if (params.status) conditions.push(eq(compensationReview.status, params.status));
        const reviews = await db.query.compensationReview.findMany({
          where: and(...conditions),
          orderBy: desc(compensationReview.createdAt),
        });
        const counts = reviews.length
          ? await db
              .select({
                reviewId: compensationReviewEntry.reviewId,
                count: sql<number>`count(*)`.mapWith(Number),
              })
              .from(compensationReviewEntry)
              .where(inArray(compensationReviewEntry.reviewId, reviews.map((r) => r.id)))
              .groupBy(compensationReviewEntry.reviewId)
          : [];
        const countByReview = new Map(counts.map((c) => [c.reviewId, c.count]));
        return { reviews: reviews.map((r) => ({ ...r, entryCount: countByReview.get(r.id) ?? 0 })) };
      })
  );

  server.tool(
    "get_compensation_review",
    "Get one compensation review with its entries. Each entry has the employee (id, name, employeeNumber), currentSalary and proposedSalary (annual, integer cents), adjustmentPercent, reason and approved (null = undecided).",
    {
      reviewId: z.string().uuid().describe("Review id (from list_compensation_reviews)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:compensation");
        const review = await db.query.compensationReview.findFirst({
          where: and(
            eq(compensationReview.id, params.reviewId),
            eq(compensationReview.organizationId, ctx.organizationId),
            notDeleted(compensationReview.deletedAt)
          ),
          with: {
            entries: {
              with: { employee: { columns: { id: true, name: true, employeeNumber: true, salary: true } } },
            },
          },
        });
        if (!review) throw new AuthError("Compensation review not found", 404);
        return { review };
      })
  );

  server.tool(
    "create_compensation_review",
    "Create a compensation review (status draft). Add employees with add_compensation_review_entry, then complete it with update_compensation_review_status to apply the new salaries. totalBudget is in integer cents. Returns the created review.",
    {
      name: z.string().min(1).describe("Review name, e.g. '2026 annual review'"),
      effectiveDate: dateSchema.describe("Date the new salaries take effect, YYYY-MM-DD"),
      totalBudget: z.number().int().min(0).optional().describe("Budget for the raises in integer cents (optional)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:compensation");
        const [review] = await db
          .insert(compensationReview)
          .values({ organizationId: ctx.organizationId, ...params })
          .returning();
        await logAudit({ ctx, action: "create", entityType: "compensationReview", entityId: review.id });
        return { review };
      })
  );

  server.tool(
    "add_compensation_review_entry",
    "Add an employee to a draft or in-progress compensation review with a proposed new annual salary in integer cents (e.g. $95,000 = 9500000). currentSalary defaults to the employee's current annual salary; adjustmentPercent is computed if omitted. Each employee can appear once per review. Returns the created entry.",
    {
      reviewId: z.string().uuid().describe("Review id"),
      employeeId: z.string().uuid().describe("Payroll employee id (from list_payroll_employees)"),
      proposedSalary: z.number().int().min(0).describe("Proposed annual salary in integer cents"),
      currentSalary: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Current annual salary in integer cents; defaults to the employee's salary"),
      adjustmentPercent: z.number().optional().describe("Raise percentage, e.g. 5 for 5% (computed if omitted)"),
      reason: z.string().optional().describe("Reason for the change (optional)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:compensation");
        const { reviewId, ...input } = params;
        const entry = await addReviewEntry(ctx, reviewId, input);
        await logAudit({ ctx, action: "create", entityType: "compensationReviewEntry", entityId: entry.id });
        return { entry };
      })
  );

  server.tool(
    "remove_compensation_review_entry",
    "Remove an employee's entry from a draft or in-progress compensation review. Returns { success: true }.",
    {
      reviewId: z.string().uuid().describe("Review id"),
      entryId: z.string().uuid().describe("Entry id (from get_compensation_review)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:compensation");
        await removeReviewEntry(ctx, params.reviewId, params.entryId);
        await logAudit({ ctx, action: "delete", entityType: "compensationReviewEntry", entityId: params.entryId });
        return { success: true };
      })
  );

  server.tool(
    "update_compensation_review_status",
    "Move a compensation review through its workflow. Allowed: draft -> in_progress or cancelled; in_progress -> draft, completed or cancelled. Completed and cancelled are final. Completing a review immediately sets each entry's employee annual salary to the proposed salary (every entry not explicitly rejected counts as approved), in one transaction. Returns the review and salariesUpdated (number of employees whose salary changed).",
    {
      reviewId: z.string().uuid().describe("Review id"),
      status: z
        .enum(["draft", "in_progress", "completed", "cancelled"])
        .describe("New status"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:compensation");
        const result = await updateReviewStatus(ctx, params.reviewId, params.status);
        await logAudit({
          ctx,
          action: "update",
          entityType: "compensationReview",
          entityId: params.reviewId,
          changes: { status: params.status, salariesUpdated: result.salariesUpdated },
        });
        return result;
      })
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { costCenter } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for cost centers — the tracking dimension used to tag journal lines
 * for departmental / cost-center reporting. Cost centers form a tree (each may
 * have a parent cost center) and are unique by code within an organization.
 *
 * There are no monetary amounts on a cost center. Direct DB access via Drizzle
 * (no HTTP self-calls); every query is org-scoped via the AuthContext and skips
 * soft-deleted rows. Mirrors app/api/v1/cost-centers (+ [id]).
 */
export function registerCostCenterTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_cost_centers",
    "List the organization's cost centers with pagination, newest first. Each row includes its parent cost center (if any). Returns the cost centers and the total count.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of cost centers to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(costCenter.organizationId, ctx.organizationId),
          notDeleted(costCenter.deletedAt),
        ];

        const offset = (params.page - 1) * params.limit;
        const centers = await db.query.costCenter.findMany({
          where: and(...conditions),
          orderBy: desc(costCenter.createdAt),
          limit: params.limit,
          offset,
          with: { parent: true },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(costCenter)
          .where(and(...conditions));

        return { costCenters: centers, total: Number(countResult?.count || 0) };
      })
  );

  server.tool(
    "get_cost_center",
    "Get a single cost center by ID, including its parent cost center (if any).",
    {
      costCenterId: z.string().describe("The UUID of the cost center"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.costCenter.findFirst({
          where: and(
            eq(costCenter.id, params.costCenterId),
            eq(costCenter.organizationId, ctx.organizationId),
            notDeleted(costCenter.deletedAt)
          ),
          with: { parent: true },
        });
        if (!found) throw new Error("Cost center not found");
        return { costCenter: found };
      })
  );

  server.tool(
    "create_cost_center",
    "Create a cost center. The code must be unique within the organization. Optionally nest it under a parent cost center. New cost centers are active by default. Returns the created cost center.",
    {
      code: z.string().min(1).describe("Short unique code for the cost center (unique within the org)"),
      name: z.string().min(1).describe("Display name of the cost center"),
      parentId: z
        .string()
        .nullable()
        .optional()
        .describe("UUID of the parent cost center to nest this under, or null/omitted for a top-level cost center"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:cost-centers");

        const [created] = await db
          .insert(costCenter)
          .values({
            organizationId: ctx.organizationId,
            code: params.code,
            name: params.name,
            parentId: params.parentId || null,
          })
          .returning();

        return { costCenter: created };
      })
  );

  server.tool(
    "update_cost_center",
    "Update a cost center's code, name, parent, or active flag. Only the fields you provide are changed. The code must stay unique within the organization. Returns the updated cost center.",
    {
      costCenterId: z.string().describe("The UUID of the cost center to update"),
      code: z.string().min(1).optional().describe("New unique code for the cost center"),
      name: z.string().min(1).optional().describe("New display name of the cost center"),
      parentId: z
        .string()
        .nullable()
        .optional()
        .describe("UUID of the parent cost center, or null to make it top-level"),
      isActive: z.boolean().optional().describe("Whether the cost center is active"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:cost-centers");

        const existing = await db.query.costCenter.findFirst({
          where: and(
            eq(costCenter.id, params.costCenterId),
            eq(costCenter.organizationId, ctx.organizationId),
            notDeleted(costCenter.deletedAt)
          ),
        });
        if (!existing) throw new Error("Cost center not found");

        const patch: {
          code?: string;
          name?: string;
          parentId?: string | null;
          isActive?: boolean;
        } = {};
        if (params.code !== undefined) patch.code = params.code;
        if (params.name !== undefined) patch.name = params.name;
        if (params.parentId !== undefined) patch.parentId = params.parentId;
        if (params.isActive !== undefined) patch.isActive = params.isActive;

        const [updated] = await db
          .update(costCenter)
          .set(patch)
          .where(eq(costCenter.id, params.costCenterId))
          .returning();

        return { costCenter: updated };
      })
  );

  server.tool(
    "delete_cost_center",
    "Soft-delete a cost center. It is hidden from listings but historical journal-line tags referencing it are preserved. Returns success.",
    {
      costCenterId: z.string().describe("The UUID of the cost center to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:cost-centers");

        const existing = await db.query.costCenter.findFirst({
          where: and(
            eq(costCenter.id, params.costCenterId),
            eq(costCenter.organizationId, ctx.organizationId),
            notDeleted(costCenter.deletedAt)
          ),
        });
        if (!existing) throw new Error("Cost center not found");

        await db
          .update(costCenter)
          .set(softDelete())
          .where(eq(costCenter.id, params.costCenterId));

        return { success: true };
      })
  );
}

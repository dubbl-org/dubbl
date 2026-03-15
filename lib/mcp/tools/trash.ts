import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { eq, and, gt, isNotNull, desc } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { TRASHABLE_ENTITIES, getTrashEntity } from "@/lib/api/trash-entities";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerTrashTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_trash",
    "List soft-deleted records in trash. Returns items deleted within the last 30 days. Optionally filter by entity type.",
    {
      entityType: z
        .string()
        .optional()
        .describe("Filter by entity type e.g. contact, invoice, bill"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of items to return (max 100)"),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("Number of items to skip for pagination"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const entities = params.entityType
          ? TRASHABLE_ENTITIES.filter((e) => e.type === params.entityType)
          : TRASHABLE_ENTITIES;

        const allResults: {
          id: string;
          name: string | null;
          deletedAt: Date;
          entityType: string;
          label: string;
        }[] = [];

        for (const entity of entities) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const table = entity.table as any;

          const rows = await db
            .select({
              id: table.id,
              name: table[entity.nameCol],
              deletedAt: table.deletedAt,
            })
            .from(table)
            .where(
              and(
                eq(table.organizationId, ctx.organizationId),
                isNotNull(table.deletedAt),
                gt(table.deletedAt, thirtyDaysAgo),
              )
            )
            .orderBy(desc(table.deletedAt));

          for (const row of rows) {
            allResults.push({
              id: row.id,
              name: row.name,
              deletedAt: row.deletedAt,
              entityType: entity.type,
              label: entity.label,
            });
          }
        }

        allResults.sort(
          (a, b) =>
            new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
        );

        const total = allResults.length;
        const items = allResults.slice(params.offset, params.offset + params.limit);

        return { items, total };
      })
  );

  server.tool(
    "restore_trash_item",
    "Restore a soft-deleted record from trash. Sets deletedAt to null.",
    {
      entityId: z.string().describe("UUID of the record to restore"),
      entityType: z.string().describe("Entity type e.g. contact, invoice"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const entity = getTrashEntity(params.entityType);
        if (!entity) throw new Error("Invalid entity type");

        requireRole(ctx, entity.permission);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const table = entity.table as any;

        const [record] = await db
          .select({ id: table.id })
          .from(table)
          .where(
            and(
              eq(table.id, params.entityId),
              eq(table.organizationId, ctx.organizationId),
              isNotNull(table.deletedAt),
            )
          );

        if (!record) throw new Error("Record not found in trash");

        await db
          .update(table)
          .set({ deletedAt: null })
          .where(eq(table.id, params.entityId));

        return { success: true, entityType: params.entityType, entityId: params.entityId };
      })
  );

  server.tool(
    "purge_trash_item",
    "Permanently delete a record from trash. This cannot be undone.",
    {
      entityId: z.string().describe("UUID of the record to permanently delete"),
      entityType: z.string().describe("Entity type e.g. contact, invoice"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const entity = getTrashEntity(params.entityType);
        if (!entity) throw new Error("Invalid entity type");

        requireRole(ctx, entity.permission);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const table = entity.table as any;

        const [record] = await db
          .select({ id: table.id })
          .from(table)
          .where(
            and(
              eq(table.id, params.entityId),
              eq(table.organizationId, ctx.organizationId),
              isNotNull(table.deletedAt),
            )
          );

        if (!record) throw new Error("Record not found in trash");

        await db.delete(table).where(eq(table.id, params.entityId));

        return { success: true, entityType: params.entityType, entityId: params.entityId };
      })
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { dataBackup } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { createOrgSnapshot, restoreFromSnapshot } from "@/lib/api/backup-snapshot";
import { notDeleted } from "@/lib/db/soft-delete";
import { softDelete } from "@/lib/db/soft-delete";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerBackupTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_backups",
    "List organization data backups. Returns backup metadata including type, status, size, and entity counts.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe("Number of backups to return (max 50)"),
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
        const condition = and(
          eq(dataBackup.organizationId, ctx.organizationId),
          notDeleted(dataBackup.deletedAt),
        );

        const backups = await db
          .select()
          .from(dataBackup)
          .where(condition)
          .orderBy(desc(dataBackup.createdAt))
          .limit(params.limit)
          .offset(params.offset);

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(dataBackup)
          .where(condition);

        return {
          backups,
          total: Number(countResult?.count ?? 0),
        };
      })
  );

  server.tool(
    "create_backup",
    "Create a manual backup of all organization data. Returns the backup record with status and entity counts.",
    {},
    () =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:audit-log");

        const backup = await createOrgSnapshot(
          ctx.organizationId,
          ctx.userId,
          "manual",
        );

        return { backup };
      })
  );

  server.tool(
    "restore_backup",
    "Restore organization data from a backup. WARNING: This replaces all current data. Current data will be moved to trash.",
    {
      backupId: z.string().describe("UUID of the backup to restore"),
      confirm: z
        .boolean()
        .describe("Must be true to confirm the restore operation"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "delete:organization");

        if (params.confirm !== true) {
          throw new Error("You must set confirm to true to proceed with restore");
        }

        const result = await restoreFromSnapshot(
          ctx.organizationId,
          params.backupId,
          ctx,
        );

        return result;
      })
  );

  server.tool(
    "delete_backup",
    "Delete a backup. Moves to trash for 30 days before permanent removal.",
    {
      backupId: z.string().describe("UUID of the backup to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "delete:organization");

        const backup = await db.query.dataBackup.findFirst({
          where: and(
            eq(dataBackup.id, params.backupId),
            eq(dataBackup.organizationId, ctx.organizationId),
            notDeleted(dataBackup.deletedAt),
          ),
        });

        if (!backup) throw new Error("Backup not found");

        await db
          .update(dataBackup)
          .set(softDelete())
          .where(eq(dataBackup.id, params.backupId));

        return { success: true };
      })
  );
}

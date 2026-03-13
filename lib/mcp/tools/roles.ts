import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { customRole, member } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { ALL_PERMISSIONS } from "@/lib/plans";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerRoleTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_roles",
    "List all custom roles for the organization, including each role's name, description, permissions array, and member count. System roles (isSystem: true) mirror the built-in owner/admin/member hierarchy.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const roles = await db.query.customRole.findMany({
          where: eq(customRole.organizationId, ctx.organizationId),
        });

        const rolesWithCounts = await Promise.all(
          roles.map(async (role) => {
            const [result] = await db
              .select({ count: sql<number>`count(*)::int` })
              .from(member)
              .where(
                and(
                  eq(member.organizationId, ctx.organizationId),
                  eq(member.customRoleId, role.id)
                )
              );
            return { ...role, memberCount: result?.count ?? 0 };
          })
        );

        return { roles: rolesWithCounts, total: rolesWithCounts.length };
      })
  );

  server.tool(
    "get_role",
    "Get a single custom role by ID with its permissions and member count.",
    {
      roleId: z.string().describe("The UUID of the custom role"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const role = await db.query.customRole.findFirst({
          where: and(
            eq(customRole.id, params.roleId),
            eq(customRole.organizationId, ctx.organizationId)
          ),
        });

        if (!role) throw new Error("Role not found");

        const [result] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(member)
          .where(
            and(
              eq(member.organizationId, ctx.organizationId),
              eq(member.customRoleId, role.id)
            )
          );

        return { role: { ...role, memberCount: result?.count ?? 0 } };
      })
  );

  server.tool(
    "create_role",
    "Create a new custom role for the organization. Requires the change:roles permission. The permissions array must contain valid permission strings (e.g. 'manage:invoices', 'view:data').",
    {
      name: z
        .string()
        .min(1)
        .max(100)
        .describe("Role name (e.g. 'Bookkeeper', 'Approver')"),
      description: z
        .string()
        .max(500)
        .optional()
        .describe("Optional role description"),
      permissions: z
        .array(z.string())
        .min(1)
        .describe(
          "Array of permission strings. Valid permissions: " +
            ALL_PERMISSIONS.join(", ")
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "change:roles");

        // Validate permissions
        const invalid = params.permissions.filter(
          (p) => !ALL_PERMISSIONS.includes(p)
        );
        if (invalid.length > 0) {
          throw new Error(`Invalid permissions: ${invalid.join(", ")}`);
        }

        const [created] = await db
          .insert(customRole)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            description: params.description || null,
            permissions: params.permissions,
          })
          .returning();

        return { role: created };
      })
  );

  server.tool(
    "update_role",
    "Update an existing custom role's name, description, or permissions. Cannot modify system roles. Requires change:roles permission.",
    {
      roleId: z.string().describe("The UUID of the custom role to update"),
      name: z
        .string()
        .min(1)
        .max(100)
        .optional()
        .describe("New role name"),
      description: z
        .string()
        .max(500)
        .nullable()
        .optional()
        .describe("New description (null to clear)"),
      permissions: z
        .array(z.string())
        .min(1)
        .optional()
        .describe("New permissions array"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "change:roles");

        const existing = await db.query.customRole.findFirst({
          where: and(
            eq(customRole.id, params.roleId),
            eq(customRole.organizationId, ctx.organizationId)
          ),
        });

        if (!existing) throw new Error("Role not found");
        if (existing.isSystem)
          throw new Error("Cannot modify system roles");

        if (params.permissions) {
          const invalid = params.permissions.filter(
            (p) => !ALL_PERMISSIONS.includes(p)
          );
          if (invalid.length > 0) {
            throw new Error(`Invalid permissions: ${invalid.join(", ")}`);
          }
        }

        const [updated] = await db
          .update(customRole)
          .set({
            ...(params.name !== undefined && { name: params.name }),
            ...(params.description !== undefined && {
              description: params.description,
            }),
            ...(params.permissions !== undefined && {
              permissions: params.permissions,
            }),
            updatedAt: new Date(),
          })
          .where(eq(customRole.id, params.roleId))
          .returning();

        return { role: updated };
      })
  );

  server.tool(
    "assign_role",
    "Assign a custom role to a member, or remove their custom role (pass null). Requires change:roles permission. The member's base role (owner/admin/member) is not changed. When a custom role is assigned, its permissions take precedence over the base role.",
    {
      memberId: z.string().describe("The UUID of the member"),
      customRoleId: z
        .string()
        .nullable()
        .describe(
          "The UUID of the custom role to assign, or null to remove custom role"
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "change:roles");

        const target = await db.query.member.findFirst({
          where: and(
            eq(member.id, params.memberId),
            eq(member.organizationId, ctx.organizationId)
          ),
        });

        if (!target) throw new Error("Member not found");

        if (params.customRoleId) {
          const role = await db.query.customRole.findFirst({
            where: and(
              eq(customRole.id, params.customRoleId),
              eq(customRole.organizationId, ctx.organizationId)
            ),
          });
          if (!role) throw new Error("Role not found");
        }

        const [updated] = await db
          .update(member)
          .set({ customRoleId: params.customRoleId })
          .where(eq(member.id, params.memberId))
          .returning();

        return { member: updated };
      })
  );
}

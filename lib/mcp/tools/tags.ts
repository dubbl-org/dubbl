import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { tag, entityTag } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for tags — flexible, color-coded labels an org applies to its
 * records (journal entries, invoices, bills, expenses, contacts, projects) for
 * segmentation and reporting.
 *
 * Every query is scoped to the caller's organization, and any tag referenced
 * for update/delete/attach/detach is verified to belong to the caller's org
 * first. Tags are soft-deleted (deletedAt). Direct DB access via Drizzle (no
 * HTTP self-calls); org-scoped via the AuthContext.
 */

// The entity kinds a tag can be attached to — mirrors the REST attach/detach
// route enum exactly.
const ENTITY_TYPES = [
  "journal_entry",
  "invoice",
  "bill",
  "expense",
  "contact",
  "project",
] as const;

export function registerTagTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_tags",
    "List all tags for the organization (excludes deleted), ordered by name. Each tag has id, name, color (hex), and optional description. Returns the tags.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const tags = await db.query.tag.findMany({
          where: and(
            eq(tag.organizationId, ctx.organizationId),
            notDeleted(tag.deletedAt)
          ),
          orderBy: tag.name,
        });
        return { tags };
      })
  );

  server.tool(
    "create_tag",
    "Create a new tag for the organization. name is required (1-50 chars) and must be unique within the org. color is a hex string (defaults to '#6b7280'). description is optional. Returns the created tag.",
    {
      name: z.string().min(1).max(50).describe("Tag name (1-50 chars); unique within the organization"),
      color: z
        .string()
        .optional()
        .default("#6b7280")
        .describe("Hex color for the tag (defaults to '#6b7280')"),
      description: z
        .string()
        .nullable()
        .optional()
        .describe("Optional description of what the tag is for"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const [created] = await db
          .insert(tag)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            color: params.color,
            description: params.description || null,
          })
          .returning();

        return { tag: created };
      })
  );

  server.tool(
    "update_tag",
    "Update an existing tag's name, color, and/or description. Only the supplied fields are changed. The tag must belong to the caller's organization. Returns the updated tag.",
    {
      tagId: z.string().describe("The UUID of the tag to update"),
      name: z
        .string()
        .min(1)
        .max(50)
        .optional()
        .describe("New tag name (1-50 chars); unique within the organization"),
      color: z.string().optional().describe("New hex color for the tag"),
      description: z
        .string()
        .nullable()
        .optional()
        .describe("New description; pass null to clear it"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const existing = await db.query.tag.findFirst({
          where: and(
            eq(tag.id, params.tagId),
            eq(tag.organizationId, ctx.organizationId),
            notDeleted(tag.deletedAt)
          ),
        });
        if (!existing) throw new Error("Tag not found");

        const changes: { name?: string; color?: string; description?: string | null } = {};
        if (params.name !== undefined) changes.name = params.name;
        if (params.color !== undefined) changes.color = params.color;
        if (params.description !== undefined) changes.description = params.description;

        const [updated] = await db
          .update(tag)
          .set(changes)
          .where(eq(tag.id, params.tagId))
          .returning();

        return { tag: updated };
      })
  );

  server.tool(
    "delete_tag",
    "Soft-delete a tag (sets deletedAt) so it no longer appears in listings. The tag must belong to the caller's organization. Returns success.",
    {
      tagId: z.string().describe("The UUID of the tag to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const existing = await db.query.tag.findFirst({
          where: and(
            eq(tag.id, params.tagId),
            eq(tag.organizationId, ctx.organizationId),
            notDeleted(tag.deletedAt)
          ),
        });
        if (!existing) throw new Error("Tag not found");

        await db
          .update(tag)
          .set({ deletedAt: new Date() })
          .where(eq(tag.id, params.tagId));

        return { success: true };
      })
  );

  server.tool(
    "attach_tag",
    "Attach a tag to a record (journal entry, invoice, bill, expense, contact, or project). The tag must belong to the caller's organization. Idempotent — attaching an already-attached tag is a no-op. Returns the created link (or null if it already existed).",
    {
      tagId: z.string().describe("The UUID of the tag to attach"),
      entityType: z
        .enum(ENTITY_TYPES)
        .describe(
          "The kind of record to attach the tag to: journal_entry, invoice, bill, expense, contact, or project"
        ),
      entityId: z.string().describe("The UUID of the record to attach the tag to"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        // Verify the tag belongs to the caller's org before linking.
        const t = await db.query.tag.findFirst({
          where: and(
            eq(tag.id, params.tagId),
            eq(tag.organizationId, ctx.organizationId),
            notDeleted(tag.deletedAt)
          ),
        });
        if (!t) throw new Error("Tag not found");

        const [created] = await db
          .insert(entityTag)
          .values({
            tagId: params.tagId,
            entityType: params.entityType,
            entityId: params.entityId,
          })
          .onConflictDoNothing()
          .returning();

        return { entityTag: created ?? null };
      })
  );

  server.tool(
    "detach_tag",
    "Detach a tag from a record (journal entry, invoice, bill, expense, contact, or project). The tag must belong to the caller's organization. Returns success.",
    {
      tagId: z.string().describe("The UUID of the tag to detach"),
      entityType: z
        .enum(ENTITY_TYPES)
        .describe(
          "The kind of record to detach the tag from: journal_entry, invoice, bill, expense, contact, or project"
        ),
      entityId: z.string().describe("The UUID of the record to detach the tag from"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        // Verify the tag belongs to the caller's org before unlinking.
        const t = await db.query.tag.findFirst({
          where: and(
            eq(tag.id, params.tagId),
            eq(tag.organizationId, ctx.organizationId),
            notDeleted(tag.deletedAt)
          ),
        });
        if (!t) throw new Error("Tag not found");

        await db
          .delete(entityTag)
          .where(
            and(
              eq(entityTag.tagId, params.tagId),
              eq(entityTag.entityType, params.entityType),
              eq(entityTag.entityId, params.entityId)
            )
          );

        return { success: true };
      })
  );
}

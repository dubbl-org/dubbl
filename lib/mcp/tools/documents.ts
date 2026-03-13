import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { document, contact } from "@/lib/db/schema";
import { eq, and, desc, or, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { checkStorageLimit } from "@/lib/api/check-limit";
import { getUploadUrl } from "@/lib/s3";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerDocumentTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_contact_files",
    "List files attached to a contact. Returns shared files and your own private files.",
    {
      contactId: z
        .string()
        .describe("UUID of the contact"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of files to return (max 100)"),
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
        const ct = await db.query.contact.findFirst({
          where: and(
            eq(contact.id, params.contactId),
            eq(contact.organizationId, ctx.organizationId),
            notDeleted(contact.deletedAt)
          ),
        });
        if (!ct) throw new Error("Contact not found");

        const conditions = [
          eq(document.organizationId, ctx.organizationId),
          eq(document.entityType, "contact"),
          eq(document.entityId, params.contactId),
          notDeleted(document.deletedAt),
          or(
            eq(document.visibility, "organization"),
            and(eq(document.visibility, "private"), eq(document.uploadedBy, ctx.userId))
          ),
        ];

        const offset = (params.page - 1) * params.limit;

        const files = await db.query.document.findMany({
          where: and(...conditions),
          orderBy: desc(document.createdAt),
          limit: params.limit,
          offset,
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(document)
          .where(and(...conditions));

        return {
          files,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "upload_contact_file",
    "Upload a file to a contact. Returns a presigned S3 upload URL. File size in bytes.",
    {
      contactId: z
        .string()
        .describe("UUID of the contact"),
      fileName: z
        .string()
        .min(1)
        .describe("Name of the file"),
      fileSize: z
        .number()
        .int()
        .min(1)
        .describe("File size in bytes"),
      mimeType: z
        .string()
        .min(1)
        .describe("MIME type of the file (e.g. application/pdf)"),
      visibility: z
        .enum(["organization", "private"])
        .optional()
        .default("organization")
        .describe("Visibility: 'organization' (shared) or 'private' (only you)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contacts");

        const ct = await db.query.contact.findFirst({
          where: and(
            eq(contact.id, params.contactId),
            eq(contact.organizationId, ctx.organizationId),
            notDeleted(contact.deletedAt)
          ),
        });
        if (!ct) throw new Error("Contact not found");

        await checkStorageLimit(ctx.organizationId, params.fileSize);

        const fileKey = `documents/${ctx.organizationId}/${Date.now()}-${params.fileName}`;
        const uploadUrl = await getUploadUrl(fileKey, params.mimeType);

        const [doc] = await db
          .insert(document)
          .values({
            organizationId: ctx.organizationId,
            fileName: params.fileName,
            fileKey,
            fileSize: params.fileSize,
            mimeType: params.mimeType,
            entityType: "contact",
            entityId: params.contactId,
            visibility: params.visibility,
            uploadedBy: ctx.userId,
          })
          .returning();

        return { document: doc, uploadUrl };
      })
  );
}

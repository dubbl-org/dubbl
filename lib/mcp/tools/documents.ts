import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  document,
  documentFolder,
  contact,
} from "@/lib/db/schema";
import { eq, and, desc, or, sql, isNull, isNotNull, ilike } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { checkStorageLimit } from "@/lib/api/check-limit";
import { getUploadUrl } from "@/lib/s3";
import type { AuthContext } from "@/lib/api/auth-context";
import { LINKABLE, describeRecords, recordExists } from "@/lib/documents/records";
import { browse } from "@/lib/documents/browse";
import { assertFolderParent, purgeDocuments, restoreDocuments, starDocuments, trashDocuments, trashFolder } from "@/lib/documents/actions";

/** Thumbnail links are for the browser only. */
const withoutThumb = <T extends { thumbUrl: unknown }>({ thumbUrl, ...f }: T) => (void thumbUrl, f);

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

  server.tool(
    "list_entity_files",
    "List files/attachments linked to any business entity (invoice, bill, payment, journal entry, bank transaction, contact, etc.). Returns shared files and your own private files. File sizes are in bytes.",
    {
      entityType: z
        .string()
        .min(1)
        .describe(
          "Type of entity the files are attached to, e.g. 'invoice', 'bill', 'payment', 'journal_entry', 'bank_transaction', 'contact'"
        ),
      entityId: z
        .string()
        .uuid()
        .describe("UUID of the entity to list attachments for"),
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
        const conditions = [
          eq(document.organizationId, ctx.organizationId),
          eq(document.entityType, params.entityType),
          eq(document.entityId, params.entityId),
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
    "attach_file_to_entity",
    "Attach a file to any business entity (invoice, bill, payment, journal entry, bank transaction, contact, etc.). A record can have any number of attachments — call once per file (e.g. several receipts on one bank transaction while reconciling). Returns the document record plus a presigned S3 upload URL the file bytes must be PUT to. File size in bytes.",
    {
      entityType: z
        .string()
        .min(1)
        .describe(
          "Type of entity to attach the file to, e.g. 'invoice', 'bill', 'payment', 'journal_entry', 'bank_transaction', 'contact'"
        ),
      entityId: z
        .string()
        .uuid()
        .describe("UUID of the entity to attach the file to"),
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
        requireRole(ctx, "view:data");

        await checkStorageLimit(ctx.organizationId, params.fileSize);
        if ((LINKABLE as readonly string[]).includes(params.entityType)) {
          if (!(await recordExists(ctx.organizationId, params.entityType as (typeof LINKABLE)[number], params.entityId))) {
            throw new Error(`No ${params.entityType.replace(/_/g, " ")} with that id in this workspace`);
          }
        }

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
            entityType: params.entityType,
            entityId: params.entityId,
            visibility: params.visibility,
            uploadedBy: ctx.userId,
          })
          .returning();

        return { document: doc, uploadUrl };
      })
  );

  server.tool(
    "link_document_to_record",
    "Link a file that is already stored in dubbl (for example one the user uploaded to Tilly) to a record, so it shows up as that record's attachment. Use it after booking a receipt or bill from an upload. Returns the updated document.",
    {
      documentId: z.string().uuid().describe("UUID of the stored document to link"),
      entityType: z.enum(LINKABLE).describe("Kind of record to link the file to"),
      entityId: z.string().uuid().describe("UUID of the record to link the file to"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        const doc = await db.query.document.findFirst({
          where: and(
            eq(document.id, params.documentId),
            eq(document.organizationId, ctx.organizationId),
            notDeleted(document.deletedAt),
            or(eq(document.visibility, "organization"), eq(document.uploadedBy, ctx.userId))
          ),
        });
        if (!doc) throw new Error("Document not found");
        if (!(await recordExists(ctx.organizationId, params.entityType, params.entityId))) {
          throw new Error(`No ${params.entityType.replace(/_/g, " ")} with that id in this workspace`);
        }
        const [updated] = await db
          .update(document)
          .set({ entityType: params.entityType, entityId: params.entityId })
          .where(eq(document.id, doc.id))
          .returning();
        return { document: updated };
      })
  );

  // --- Document library (folders, unattached files, filing) ---

  /** A stored file this user may see: shared ones, plus their own private ones. */
  async function findVisibleDocument(documentId: string) {
    const doc = await db.query.document.findFirst({
      where: and(
        eq(document.id, documentId),
        eq(document.organizationId, ctx.organizationId),
        notDeleted(document.deletedAt),
        or(eq(document.visibility, "organization"), eq(document.uploadedBy, ctx.userId))
      ),
    });
    if (!doc) throw new Error("Document not found");
    return doc;
  }

  server.tool(
    "list_documents",
    "List stored files in the document library, newest first. Filter by folder, by whether they're attached to a record (linked='none' finds files nobody has filed yet, such as uploads shared with Tilly; linked='any' finds attachments and adds a `record` { kind, label, href } describing what each is attached to), by record kind, or by a file-name search. Returns shared files and your own private files; fileSize is in bytes.",
    {
      folderId: z.string().uuid().optional().describe("Only files in this folder (UUID)"),
      linked: z.enum(["none", "any"]).optional().describe("'none' = not attached to any record, 'any' = attached to a record"),
      entityType: z.string().optional().describe("Only files attached to this kind of record, e.g. 'bill', 'invoice', 'bank_transaction'"),
      search: z.string().optional().describe("Case-insensitive match on the file name"),
      limit: z.number().int().min(1).max(100).optional().default(50).describe("Files per page (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(document.organizationId, ctx.organizationId),
          notDeleted(document.deletedAt),
          or(eq(document.visibility, "organization"), eq(document.uploadedBy, ctx.userId)),
        ];
        if (params.folderId) conditions.push(eq(document.folderId, params.folderId));
        if (params.linked === "none") conditions.push(isNull(document.entityType));
        if (params.linked === "any") conditions.push(isNotNull(document.entityType));
        if (params.entityType) conditions.push(eq(document.entityType, params.entityType));
        if (params.search) conditions.push(ilike(document.fileName, `%${params.search}%`));
        const where = and(...conditions);

        const [{ total }] = await db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(document).where(where);
        const files = await db.query.document.findMany({
          where,
          orderBy: desc(document.createdAt),
          limit: params.limit,
          offset: (params.page - 1) * params.limit,
          with: { folder: { columns: { id: true, name: true } }, uploader: { columns: { id: true, name: true, email: true } } },
        });
        let withRecords: unknown[] = files;
        if (params.linked === "any") {
          const records = await describeRecords(
            ctx.organizationId,
            files.filter((f) => f.entityType && f.entityId).map((f) => ({ type: f.entityType!, id: f.entityId! }))
          );
          withRecords = files.map((f) => ({ ...f, record: f.entityType && f.entityId ? records.get(`${f.entityType}:${f.entityId}`) ?? null : null }));
        }
        return { files: withRecords, total, page: params.page, limit: params.limit };
      })
  );

  server.tool(
    "list_document_folders",
    "List every folder in the document library (flat, ordered by name). parentId links a subfolder to its parent; null means a top-level folder.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const folders = await db.query.documentFolder.findMany({
          where: and(eq(documentFolder.organizationId, ctx.organizationId), notDeleted(documentFolder.deletedAt)),
          orderBy: documentFolder.name,
        });
        return { folders };
      })
  );

  server.tool(
    "create_document_folder",
    "Create a folder in the document library, optionally inside another folder. Returns the created folder.",
    {
      name: z.string().min(1).describe("Folder name, e.g. 'Contracts' or '2026 receipts'"),
      parentId: z.string().uuid().nullable().optional().describe("UUID of the folder to create it inside, or null/omitted for the top level"),
      color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional().describe("Optional label colour as a hex value like #3b82f6"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        if (params.parentId) {
          const parent = await db.query.documentFolder.findFirst({
            where: and(eq(documentFolder.id, params.parentId), eq(documentFolder.organizationId, ctx.organizationId), notDeleted(documentFolder.deletedAt)),
          });
          if (!parent) throw new Error("Parent folder not found");
        }
        const [folder] = await db
          .insert(documentFolder)
          .values({ organizationId: ctx.organizationId, name: params.name, parentId: params.parentId ?? null, color: params.color ?? null })
          .returning();
        return { folder };
      })
  );

  server.tool(
    "update_document_folder",
    "Rename a document folder, give it a label colour, or move it inside another folder (parentId null moves it to the top level; a folder can't go inside its own subfolders). Only provided fields change. Returns the updated folder.",
    {
      folderId: z.string().uuid().describe("UUID of the folder"),
      name: z.string().min(1).optional().describe("New folder name"),
      parentId: z.string().uuid().nullable().optional().describe("UUID of the new parent folder, or null for the top level"),
      color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional().describe("Label colour as a hex value like #3b82f6, or null to clear it"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        if (params.parentId !== undefined) await assertFolderParent(ctx.organizationId, params.folderId, params.parentId);
        const updates: { name?: string; parentId?: string | null; color?: string | null } = {};
        if (params.name !== undefined) updates.name = params.name;
        if (params.parentId !== undefined) updates.parentId = params.parentId;
        if (params.color !== undefined) updates.color = params.color;
        if (Object.keys(updates).length === 0) throw new Error("Nothing to change");
        const [folder] = await db
          .update(documentFolder)
          .set(updates)
          .where(and(eq(documentFolder.id, params.folderId), eq(documentFolder.organizationId, ctx.organizationId), notDeleted(documentFolder.deletedAt)))
          .returning();
        if (!folder) throw new Error("Folder not found");
        return { folder };
      })
  );

  server.tool(
    "delete_document_folder",
    "Delete a document folder together with its subfolders. Every file inside moves to Trash, where it can be restored for 30 days with restore_document. Returns { success: true, folders, files } with how many folders were deleted and files trashed.",
    {
      folderId: z.string().uuid().describe("UUID of the folder to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        return { success: true, ...(await trashFolder(ctx, params.folderId)) };
      })
  );

  server.tool(
    "update_document",
    "Rename a stored file, move it into a folder (folderId null = top level), or change who can see it ('organization' = everyone in the workspace, 'private' = only the uploader; only the uploader may change this). Only provided fields change. To attach it to a record use link_document_to_record; to detach use detach_document_from_record. Returns the updated document.",
    {
      documentId: z.string().uuid().describe("UUID of the stored file"),
      fileName: z.string().min(1).optional().describe("New file name, including its extension"),
      folderId: z.string().uuid().nullable().optional().describe("UUID of the folder to move it into, or null for the top level"),
      visibility: z.enum(["organization", "private"]).optional().describe("Who can see the file"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        const doc = await findVisibleDocument(params.documentId);
        if (params.visibility && doc.uploadedBy !== ctx.userId) throw new Error("Only the person who uploaded this file can change who sees it");
        const updates: { fileName?: string; folderId?: string | null; visibility?: string } = {};
        if (params.fileName !== undefined) updates.fileName = params.fileName;
        if (params.visibility !== undefined) updates.visibility = params.visibility;
        if (params.folderId !== undefined) {
          if (params.folderId) {
            const folder = await db.query.documentFolder.findFirst({
              where: and(eq(documentFolder.id, params.folderId), eq(documentFolder.organizationId, ctx.organizationId), notDeleted(documentFolder.deletedAt)),
            });
            if (!folder) throw new Error("Folder not found");
          }
          updates.folderId = params.folderId;
        }
        if (Object.keys(updates).length === 0) throw new Error("Nothing to change");
        const [updated] = await db.update(document).set(updates).where(eq(document.id, doc.id)).returning();
        return { document: updated };
      })
  );

  server.tool(
    "detach_document_from_record",
    "Detach a stored file from the record it's attached to (invoice, bill, expense, etc.). The file itself is kept and shows up again among unattached files. Returns the updated document.",
    {
      documentId: z.string().uuid().describe("UUID of the stored file"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        const doc = await findVisibleDocument(params.documentId);
        const [updated] = await db.update(document).set({ entityType: null, entityId: null }).where(eq(document.id, doc.id)).returning();
        return { document: updated };
      })
  );

  server.tool(
    "delete_document",
    "Move a stored file to Trash. It disappears from the library and from the record it was attached to, but can be brought back with restore_document for 30 days; after that it's deleted for good. Use permanently_delete_document to delete it straight away. Returns { success: true }.",
    {
      documentId: z.string().uuid().describe("UUID of the stored file to move to Trash"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        const { count } = await trashDocuments(ctx, [params.documentId]);
        if (!count) throw new Error("Document not found");
        return { success: true };
      })
  );

  server.tool(
    "list_trashed_documents",
    "List files in Trash (deleted in the last 30 days), most recently deleted first. Returns { files } with id, fileName, mimeType, fileSize (bytes), deletedAt and what each was attached to.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const { files } = await browse({ orgId: ctx.organizationId, userId: ctx.userId, view: "trash" });
        return { files: files.map(withoutThumb) };
      })
  );

  server.tool(
    "restore_document",
    "Bring a file back from Trash. It returns to its old folder if that folder still exists, otherwise to the top level, and is attached to its record again. Returns { success: true }.",
    {
      documentId: z.string().uuid().describe("UUID of the file in Trash"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        const { count } = await restoreDocuments(ctx, [params.documentId]);
        if (!count) throw new Error("No file with that id in Trash");
        return { success: true };
      })
  );

  server.tool(
    "permanently_delete_document",
    "Delete a file in Trash for good, including its stored bytes. This can't be undone; the file must already be in Trash (use delete_document first). Returns { success: true }.",
    {
      documentId: z.string().uuid().describe("UUID of the file in Trash"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        const { count } = await purgeDocuments(ctx, [params.documentId]);
        if (!count) throw new Error("No file with that id in Trash");
        return { success: true };
      })
  );

  server.tool(
    "star_document",
    "Star a stored file so it shows under Starred. Stars are personal to you. Returns { success: true }.",
    {
      documentId: z.string().uuid().describe("UUID of the stored file"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const { count } = await starDocuments(ctx, [params.documentId], true);
        if (!count) throw new Error("Document not found");
        return { success: true };
      })
  );

  server.tool(
    "unstar_document",
    "Remove your star from a stored file. Returns { success: true }.",
    {
      documentId: z.string().uuid().describe("UUID of the stored file"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const { count } = await starDocuments(ctx, [params.documentId], false);
        if (!count) throw new Error("Document not found");
        return { success: true };
      })
  );

  server.tool(
    "list_starred_documents",
    "List the files you starred, newest first. Returns { files } with id, fileName, mimeType, fileSize (bytes), folderId and what each is attached to.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const { files } = await browse({ orgId: ctx.organizationId, userId: ctx.userId, view: "starred" });
        return { files: files.map(withoutThumb) };
      })
  );

  server.tool(
    "get_document_library_summary",
    "Overview of the document library: how many files sit in each view (all, recent, starred, unattached, attached, private, trash), files per record kind, storage used and allowed in bytes, and the folder tree with file counts. Returns { counts, byRecord, storage, folders }.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const { counts, byRecord, storage, folders } = await browse({ orgId: ctx.organizationId, userId: ctx.userId, view: "recent" });
        return { counts, byRecord, storage, folders };
      })
  );
}

import { and, eq, inArray, isNotNull, isNull, lt, not, or, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { document, documentFolder, documentStar } from "@/lib/db/schema";
import { AuthError, type AuthContext } from "@/lib/api/auth-context";
import { logAudit } from "@/lib/api/audit";
import { deleteObject } from "@/lib/s3";

/** A request the file library can't honour; carries its HTTP status. */
export class DocumentActionError extends AuthError {}

/** Files in Trash are deleted for good after this many days. */
export const TRASH_DAYS = 30;
const PURGED = "purged:";

type Ctx = AuthContext;

/** Files this member may touch: shared ones and their own private ones. */
async function visibleDocs(ctx: Ctx, ids: string[], trashed: boolean) {
  if (!ids.length) return [];
  return db
    .select()
    .from(document)
    .where(
      and(
        inArray(document.id, ids),
        eq(document.organizationId, ctx.organizationId),
        or(eq(document.visibility, "organization"), eq(document.uploadedBy, ctx.userId)),
        trashed ? isNotNull(document.deletedAt) : isNull(document.deletedAt)
      )
    );
}

async function liveFolder(orgId: string, folderId: string) {
  const folder = await db.query.documentFolder.findFirst({
    where: and(eq(documentFolder.id, folderId), eq(documentFolder.organizationId, orgId), isNull(documentFolder.deletedAt)),
  });
  if (!folder) throw new DocumentActionError("Folder not found", 404);
  return folder;
}

const audit = (ctx: Ctx, action: string, entityId: string, changes: Record<string, unknown>) =>
  logAudit({ ctx, action, entityType: "document", entityId, changes });

export async function moveDocuments(ctx: Ctx, ids: string[], folderId: string | null) {
  if (folderId) await liveFolder(ctx.organizationId, folderId);
  const docs = await visibleDocs(ctx, ids, false);
  if (!docs.length) return { count: 0 };
  await db.update(document).set({ folderId }).where(inArray(document.id, docs.map((d) => d.id)));
  return { count: docs.length };
}

/** Moves files to Trash. They can be restored for {@link TRASH_DAYS} days. */
export async function trashDocuments(ctx: Ctx, ids: string[]) {
  const docs = await visibleDocs(ctx, ids, false);
  if (!docs.length) return { count: 0 };
  await db.update(document).set({ deletedAt: new Date() }).where(inArray(document.id, docs.map((d) => d.id)));
  for (const d of docs) audit(ctx, "delete", d.id, { fileName: d.fileName, trashed: true });
  return { count: docs.length };
}

/** Brings files back from Trash, into their old folder when it still exists. */
export async function restoreDocuments(ctx: Ctx, ids: string[]) {
  const docs = (await visibleDocs(ctx, ids, true)).filter((d) => !d.fileKey.startsWith(PURGED));
  if (!docs.length) return { count: 0 };
  const folderIds = [...new Set(docs.map((d) => d.folderId).filter((f): f is string => !!f))];
  const alive = folderIds.length
    ? new Set(
        (
          await db
            .select({ id: documentFolder.id })
            .from(documentFolder)
            .where(and(inArray(documentFolder.id, folderIds), isNull(documentFolder.deletedAt)))
        ).map((f) => f.id)
      )
    : new Set<string>();
  for (const d of docs) {
    await db
      .update(document)
      .set({ deletedAt: null, folderId: d.folderId && alive.has(d.folderId) ? d.folderId : null })
      .where(eq(document.id, d.id));
    audit(ctx, "restore", d.id, { fileName: d.fileName });
  }
  return { count: docs.length };
}

/** Deletes files in Trash for good, including the stored bytes. */
export async function purgeDocuments(ctx: Ctx, ids: string[]) {
  const docs = await visibleDocs(ctx, ids, true);
  if (!docs.length) return { count: 0 };
  await db.delete(document).where(inArray(document.id, docs.map((d) => d.id)));
  for (const d of docs) {
    audit(ctx, "delete", d.id, { fileName: d.fileName, permanent: true });
    if (!d.fileKey.startsWith(PURGED)) await deleteObject(d.fileKey).catch(() => {});
  }
  return { count: docs.length };
}

export async function starDocuments(ctx: Ctx, ids: string[], starred: boolean) {
  const docs = await visibleDocs(ctx, ids, false);
  if (!docs.length) return { count: 0 };
  if (starred) {
    await db
      .insert(documentStar)
      .values(docs.map((d) => ({ userId: ctx.userId, documentId: d.id })))
      .onConflictDoNothing();
  } else {
    await db.delete(documentStar).where(and(eq(documentStar.userId, ctx.userId), inArray(documentStar.documentId, docs.map((d) => d.id))));
  }
  return { count: docs.length };
}

/** Only the uploader decides who sees a file; other files are skipped. */
export async function setDocumentVisibility(ctx: Ctx, ids: string[], visibility: "organization" | "private") {
  const docs = await visibleDocs(ctx, ids, false);
  const own = docs.filter((d) => d.uploadedBy === ctx.userId);
  if (own.length) await db.update(document).set({ visibility }).where(inArray(document.id, own.map((d) => d.id)));
  return { count: own.length, skipped: docs.length - own.length };
}

/** Throws when `parentId` can't hold `folderId` (missing, or inside it). */
export async function assertFolderParent(orgId: string, folderId: string | null, parentId: string | null) {
  if (!parentId) return;
  await liveFolder(orgId, parentId);
  if (folderId && (await folderSubtree(orgId, folderId)).includes(parentId)) {
    throw new DocumentActionError("A folder can't go inside itself or one of its subfolders", 400);
  }
}

/** Deletes a folder and its subfolders, and moves every file inside to Trash. */
export async function trashFolder(ctx: Ctx, folderId: string) {
  await liveFolder(ctx.organizationId, folderId);
  const ids = await folderSubtree(ctx.organizationId, folderId);
  const now = new Date();
  const files = await db
    .update(document)
    .set({ deletedAt: now })
    .where(and(eq(document.organizationId, ctx.organizationId), inArray(document.folderId, ids), isNull(document.deletedAt)))
    .returning({ id: document.id });
  await db.update(documentFolder).set({ deletedAt: now }).where(and(eq(documentFolder.organizationId, ctx.organizationId), inArray(documentFolder.id, ids)));
  logAudit({ ctx, action: "delete", entityType: "document_folder", entityId: folderId, changes: { folders: ids.length, files: files.length } });
  return { folders: ids.length, files: files.length };
}

/**
 * Frees the storage of files that sat in Trash past {@link TRASH_DAYS}. The
 * rows stay (for the audit trail) but can no longer be restored.
 */
export async function purgeExpiredTrash(orgId: string) {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000);
  const expired = await db
    .select({ id: document.id, fileKey: document.fileKey })
    .from(document)
    .where(and(eq(document.organizationId, orgId), lt(document.deletedAt, cutoff), not(like(document.fileKey, `${PURGED}%`))))
    .limit(200);
  for (const d of expired) {
    await deleteObject(d.fileKey).catch(() => {});
    await db.update(document).set({ fileKey: `${PURGED}${d.fileKey}` }).where(eq(document.id, d.id));
  }
  return expired.length;
}

/** Folder ids in the subtree under (and including) `rootId`. */
export async function folderSubtree(orgId: string, rootId: string) {
  const all = await db
    .select({ id: documentFolder.id, parentId: documentFolder.parentId })
    .from(documentFolder)
    .where(and(eq(documentFolder.organizationId, orgId), isNull(documentFolder.deletedAt)));
  const children = new Map<string | null, string[]>();
  for (const f of all) children.set(f.parentId, [...(children.get(f.parentId) ?? []), f.id]);
  const out: string[] = [];
  const walk = (id: string) => {
    out.push(id);
    for (const c of children.get(id) ?? []) if (!out.includes(c)) walk(c);
  };
  if (all.some((f) => f.id === rootId)) walk(rootId);
  return out;
}

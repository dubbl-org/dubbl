import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { document, documentFolder, documentStar, users } from "@/lib/db/schema";
import { getDownloadUrl } from "@/lib/s3";
import { storageUsage } from "@/lib/api/check-limit";
import { purgeExpiredTrash, TRASH_DAYS } from "./actions";
import { describeRecords, DOCUMENT_TYPE_LABELS, LINKABLE_LABELS, type RecordRef } from "./records";

export const VIEWS = ["folder", "recent", "starred", "unlinked", "linked", "private", "trash", "record", "search"] as const;
export type BrowseView = (typeof VIEWS)[number];

export interface BrowseQuery {
  orgId: string;
  userId: string;
  view: BrowseView;
  /** Folder to list for the folder view; null is the top level. */
  folderId?: string | null;
  /** Record kind for the record view, e.g. "bill". */
  recordType?: string | null;
  /** Name search across every file you can see. */
  q?: string | null;
}

export interface BrowseFile {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  folderId: string | null;
  visibility: string;
  entityType: string | null;
  entityId: string | null;
  record: RecordRef | null;
  uploader: { id: string; name: string | null } | null;
  mine: boolean;
  starred: boolean;
  createdAt: string;
  deletedAt: string | null;
  /** Short-lived link for image thumbnails. */
  thumbUrl: string | null;
}

export interface BrowseFolder {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  createdAt: string;
  /** Files directly inside. */
  fileCount: number;
  /** Bytes directly inside. */
  size: number;
}

const RECENT_DAYS = 30;
const MAX_FILES = 2000;
const THUMB_MAX_BYTES = 8 * 1024 * 1024;

/** Shared files plus your own private ones. */
const visible = (orgId: string, userId: string) =>
  and(eq(document.organizationId, orgId), or(eq(document.visibility, "organization"), eq(document.uploadedBy, userId)));

/**
 * Everything the file browser needs in one go: the folder tree with counts,
 * the files for the current view, and how many files sit in every view.
 */
export async function browse(q: BrowseQuery) {
  if (q.view === "trash") await purgeExpiredTrash(q.orgId);
  const base = visible(q.orgId, q.userId)!;
  const live = and(base, isNull(document.deletedAt))!;
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);
  const trashSince = new Date(Date.now() - TRASH_DAYS * 86_400_000);
  const starredIds = db.select({ id: documentStar.documentId }).from(documentStar).where(eq(documentStar.userId, q.userId));

  let where: SQL;
  switch (q.view) {
    case "folder":
      where = and(live, q.folderId ? eq(document.folderId, q.folderId) : isNull(document.folderId))!;
      break;
    case "recent":
      where = and(live, gte(document.createdAt, since))!;
      break;
    case "starred":
      where = and(live, inArray(document.id, starredIds))!;
      break;
    case "unlinked":
      where = and(live, isNull(document.entityType))!;
      break;
    case "linked":
      where = and(live, isNotNull(document.entityType))!;
      break;
    case "private":
      where = and(live, eq(document.visibility, "private"), eq(document.uploadedBy, q.userId))!;
      break;
    case "trash":
      where = and(base, isNotNull(document.deletedAt), gte(document.deletedAt, trashSince))!;
      break;
    case "record":
      where = and(live, eq(document.entityType, q.recordType ?? ""))!;
      break;
    case "search":
      where = and(live, ilike(document.fileName, `%${(q.q ?? "").trim()}%`))!;
      break;
  }

  const [rows, folders, folderStats, counts, byRecord, stars, storage] = await Promise.all([
    db
      .select({ d: document, uploaderName: users.name })
      .from(document)
      .leftJoin(users, eq(users.id, document.uploadedBy))
      .where(where)
      .orderBy(desc(q.view === "trash" ? document.deletedAt : document.createdAt))
      .limit(MAX_FILES),
    db
      .select()
      .from(documentFolder)
      .where(and(eq(documentFolder.organizationId, q.orgId), isNull(documentFolder.deletedAt)))
      .orderBy(documentFolder.name),
    db
      .select({ folderId: document.folderId, n: sql<number>`count(*)::int`, size: sql<number>`coalesce(sum(${document.fileSize}), 0)::bigint` })
      .from(document)
      .where(and(live, isNotNull(document.folderId)))
      .groupBy(document.folderId),
    db
      .select({
        all: sql<number>`count(*) filter (where ${document.deletedAt} is null)::int`,
        recent: sql<number>`count(*) filter (where ${document.deletedAt} is null and ${document.createdAt} >= ${since})::int`,
        unlinked: sql<number>`count(*) filter (where ${document.deletedAt} is null and ${document.entityType} is null)::int`,
        linked: sql<number>`count(*) filter (where ${document.deletedAt} is null and ${document.entityType} is not null)::int`,
        private: sql<number>`count(*) filter (where ${document.deletedAt} is null and ${document.visibility} = 'private' and ${document.uploadedBy} = ${q.userId})::int`,
        trash: sql<number>`count(*) filter (where ${document.deletedAt} is not null and ${document.deletedAt} >= ${trashSince})::int`,
      })
      .from(document)
      .where(base),
    db
      .select({ type: document.entityType, n: sql<number>`count(*)::int` })
      .from(document)
      .where(and(live, isNotNull(document.entityType)))
      .groupBy(document.entityType),
    db.select({ id: documentStar.documentId }).from(documentStar).innerJoin(document, eq(document.id, documentStar.documentId)).where(and(eq(documentStar.userId, q.userId), live)),
    storageUsage(q.orgId),
  ]);

  const starSet = new Set(stars.map((s) => s.id));
  const refs = rows.filter((r) => r.d.entityType && r.d.entityId).map((r) => ({ type: r.d.entityType!, id: r.d.entityId! }));
  const records = refs.length ? await describeRecords(q.orgId, refs) : new Map<string, RecordRef>();
  const statOf = new Map(folderStats.map((f) => [f.folderId, f]));

  const files: BrowseFile[] = await Promise.all(
    rows.map(async ({ d, uploaderName }) => ({
      id: d.id,
      fileName: d.fileName,
      mimeType: d.mimeType,
      fileSize: d.fileSize,
      folderId: d.folderId,
      visibility: d.visibility,
      entityType: d.entityType,
      entityId: d.entityId,
      record: d.entityType && d.entityId ? (records.get(`${d.entityType}:${d.entityId}`) ?? null) : null,
      uploader: d.uploadedBy ? { id: d.uploadedBy, name: uploaderName } : null,
      mine: d.uploadedBy === q.userId,
      starred: starSet.has(d.id),
      createdAt: d.createdAt.toISOString(),
      deletedAt: d.deletedAt?.toISOString() ?? null,
      thumbUrl:
        d.mimeType.startsWith("image/") && d.fileSize <= THUMB_MAX_BYTES && !d.deletedAt
          ? await getDownloadUrl(d.fileKey, 3600).catch(() => null)
          : null,
    }))
  );

  return {
    files,
    truncated: rows.length >= MAX_FILES,
    folders: folders.map<BrowseFolder>((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      color: f.color,
      createdAt: f.createdAt.toISOString(),
      fileCount: Number(statOf.get(f.id)?.n ?? 0),
      size: Number(statOf.get(f.id)?.size ?? 0),
    })),
    counts: { ...counts[0], starred: starSet.size },
    byRecord: byRecord
      .filter((r) => r.type)
      .map((r) => ({ type: r.type!, label: LINKABLE_LABELS[r.type!] ?? DOCUMENT_TYPE_LABELS[r.type!] ?? r.type!.replace(/_/g, " "), count: Number(r.n) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    storage,
  };
}

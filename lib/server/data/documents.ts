import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentFolder, document } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";

/**
 * Server-side document library: the folder tree and the first page of files,
 * mirroring GET /api/v1/documents/folders and GET /api/v1/documents.
 */
export async function listFolders(organizationId: string) {
  return db.query.documentFolder.findMany({
    where: and(
      eq(documentFolder.organizationId, organizationId),
      notDeleted(documentFolder.deletedAt)
    ),
    orderBy: documentFolder.name,
  });
}

export async function listDocuments(organizationId: string, limit = 50) {
  return db.query.document.findMany({
    where: and(
      eq(document.organizationId, organizationId),
      notDeleted(document.deletedAt)
    ),
    orderBy: desc(document.createdAt),
    limit,
    with: { folder: true },
  });
}

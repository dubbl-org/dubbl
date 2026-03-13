import { db } from "@/lib/db";
import { document } from "@/lib/db/schema";
import { eq, and, desc, or } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, created, handleError } from "@/lib/api/response";
import { getUploadUrl } from "@/lib/s3";
import { checkStorageLimit } from "@/lib/api/check-limit";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const folderId = url.searchParams.get("folderId");

    const conditions = [
      eq(document.organizationId, ctx.organizationId),
      notDeleted(document.deletedAt),
      or(
        eq(document.visibility, "organization"),
        and(eq(document.visibility, "private"), eq(document.uploadedBy, ctx.userId))
      ),
    ];

    if (folderId) {
      conditions.push(eq(document.folderId, folderId));
    }

    const all = await db.query.document.findMany({
      where: and(...conditions),
      orderBy: desc(document.createdAt),
      with: { folder: true },
    });

    const total = all.length;
    const data = all.slice(offset, offset + limit);

    return ok(paginatedResponse(data, total, page, limit));
  } catch (err) {
    return handleError(err);
  }
}

const uploadSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().min(1),
  mimeType: z.string().min(1),
  folderId: z.string().uuid().nullable().optional(),
  entityType: z.string().nullable().optional(),
  entityId: z.string().uuid().nullable().optional(),
  visibility: z.enum(["organization", "private"]).optional().default("organization"),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = uploadSchema.parse(body);

    await checkStorageLimit(ctx.organizationId, parsed.fileSize);

    const fileKey = `documents/${ctx.organizationId}/${Date.now()}-${parsed.fileName}`;

    const uploadUrl = await getUploadUrl(fileKey, parsed.mimeType);

    const [doc] = await db
      .insert(document)
      .values({
        organizationId: ctx.organizationId,
        folderId: parsed.folderId || null,
        fileName: parsed.fileName,
        fileKey,
        fileSize: parsed.fileSize,
        mimeType: parsed.mimeType,
        entityType: parsed.entityType || null,
        entityId: parsed.entityId || null,
        visibility: parsed.visibility,
        uploadedBy: ctx.userId,
      })
      .returning();

    return created({ document: doc, uploadUrl });
  } catch (err) {
    return handleError(err);
  }
}

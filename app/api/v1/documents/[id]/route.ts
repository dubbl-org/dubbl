import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { document, documentFolder } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";
import { trashDocuments } from "@/lib/documents/actions";
import { z } from "zod";
import { LINKABLE, recordExists } from "@/lib/documents/records";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const doc = await db.query.document.findFirst({
      where: and(
        eq(document.id, id),
        eq(document.organizationId, ctx.organizationId),
        notDeleted(document.deletedAt)
      ),
    });

    if (!doc) return notFound("Document");
    if (doc.visibility === "private" && doc.uploadedBy !== ctx.userId) return notFound("Document");
    return ok({ document: doc });
  } catch (err) {
    return handleError(err);
  }
}

/** Moves the file to Trash; it can be restored for 30 days. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const { count } = await trashDocuments(ctx, [id]);
    if (!count) return notFound("Document");
    return ok({ success: true, trashed: true });
  } catch (err) {
    return handleError(err);
  }
}

const patchSchema = z.object({
  visibility: z.enum(["organization", "private"]).optional(),
  fileName: z.string().min(1).optional(),
  // Allow linking a document to a record after upload (e.g. a receipt -> the bill it became).
  // Send both as null to detach the file from its record.
  entityType: z.string().min(1).nullable().optional(),
  entityId: z.string().min(1).nullable().optional(),
  // Move into a folder, or null for the top level
  folderId: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = patchSchema.parse(body);

    const doc = await db.query.document.findFirst({
      where: and(
        eq(document.id, id),
        eq(document.organizationId, ctx.organizationId),
        notDeleted(document.deletedAt)
      ),
    });

    if (!doc) return notFound("Document");
    // Shared files can be filed by anyone in the workspace; private ones only by their owner
    if (doc.visibility === "private" && doc.uploadedBy !== ctx.userId) return notFound("Document");
    // Only the owner decides who can see a file
    if (parsed.visibility && doc.uploadedBy !== ctx.userId) {
      return NextResponse.json({ error: "Only the person who uploaded this file can change who sees it" }, { status: 403 });
    }

    const updates: Partial<typeof document.$inferInsert> = {};
    if (parsed.visibility) updates.visibility = parsed.visibility;
    if (parsed.fileName) updates.fileName = parsed.fileName;
    if (parsed.folderId !== undefined) {
      if (parsed.folderId) {
        const folder = await db.query.documentFolder.findFirst({
          where: and(eq(documentFolder.id, parsed.folderId), eq(documentFolder.organizationId, ctx.organizationId), notDeleted(documentFolder.deletedAt)),
        });
        if (!folder) return notFound("Folder");
      }
      updates.folderId = parsed.folderId;
    }
    if (parsed.entityType === null || parsed.entityId === null) {
      updates.entityType = null;
      updates.entityId = null;
    } else if (parsed.entityType || parsed.entityId) {
      const type = parsed.entityType ?? doc.entityType;
      const id = parsed.entityId ?? doc.entityId;
      // Known record kinds must point at a real record in this workspace
      if (type && id && (LINKABLE as readonly string[]).includes(type)) {
        if (!(await recordExists(ctx.organizationId, type as (typeof LINKABLE)[number], id))) {
          return notFound(type.replace(/_/g, " "));
        }
      }
      if (parsed.entityType) updates.entityType = parsed.entityType;
      if (parsed.entityId) updates.entityId = parsed.entityId;
    }

    if (Object.keys(updates).length === 0) return ok({ document: doc });

    const [updated] = await db
      .update(document)
      .set(updates)
      .where(eq(document.id, id))
      .returning();

    return ok({ document: updated });
  } catch (err) {
    return handleError(err);
  }
}

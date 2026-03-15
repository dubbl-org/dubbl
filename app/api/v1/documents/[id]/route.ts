import { db } from "@/lib/db";
import { document } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";
import { deleteObject } from "@/lib/s3";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

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

export async function DELETE(
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

    await db.update(document).set(softDelete()).where(eq(document.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "document",
      entityId: id,
      changes: doc as Record<string, unknown>,
      request,
    });

    // Delete from S3
    await deleteObject(doc.fileKey).catch(() => {});

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

const patchSchema = z.object({
  visibility: z.enum(["organization", "private"]).optional(),
  fileName: z.string().min(1).optional(),
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
    if (doc.uploadedBy !== ctx.userId) return notFound("Document");

    const updates: Record<string, string> = {};
    if (parsed.visibility) updates.visibility = parsed.visibility;
    if (parsed.fileName) updates.fileName = parsed.fileName;

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

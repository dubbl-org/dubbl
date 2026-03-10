import { db } from "@/lib/db";
import { documentFolder } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(documentFolder)
      .set(parsed)
      .where(
        and(
          eq(documentFolder.id, id),
          eq(documentFolder.organizationId, ctx.organizationId),
          notDeleted(documentFolder.deletedAt)
        )
      )
      .returning();

    if (!updated) return notFound("Folder");
    return ok({ folder: updated });
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

    const [deleted] = await db
      .update(documentFolder)
      .set(softDelete())
      .where(
        and(
          eq(documentFolder.id, id),
          eq(documentFolder.organizationId, ctx.organizationId)
        )
      )
      .returning();

    if (!deleted) return notFound("Folder");
    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

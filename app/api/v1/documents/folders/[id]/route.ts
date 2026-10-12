import { db } from "@/lib/db";
import { documentFolder } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";
import { assertFolderParent, trashFolder } from "@/lib/documents/actions";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parentId: z.string().uuid().nullable().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
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
    if (parsed.parentId !== undefined) await assertFolderParent(ctx.organizationId, id, parsed.parentId);

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

/** Deletes the folder and its subfolders; the files inside go to Trash. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    return ok({ success: true, ...(await trashFolder(ctx, id)) });
  } catch (err) {
    return handleError(err);
  }
}

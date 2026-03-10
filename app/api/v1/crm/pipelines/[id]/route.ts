import { db } from "@/lib/db";
import { pipeline } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const p = await db.query.pipeline.findFirst({
      where: and(
        eq(pipeline.id, id),
        eq(pipeline.organizationId, ctx.organizationId),
        notDeleted(pipeline.deletedAt)
      ),
      with: { deals: true },
    });

    if (!p) return notFound("Pipeline");
    return ok({ pipeline: p });
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  stages: z.array(z.object({ id: z.string(), name: z.string(), color: z.string() })).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(pipeline)
      .set(parsed)
      .where(and(eq(pipeline.id, id), eq(pipeline.organizationId, ctx.organizationId)))
      .returning();

    if (!updated) return notFound("Pipeline");
    return ok({ pipeline: updated });
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
    requireRole(ctx, "manage:contacts");

    const [deleted] = await db
      .update(pipeline)
      .set(softDelete())
      .where(and(eq(pipeline.id, id), eq(pipeline.organizationId, ctx.organizationId)))
      .returning();

    if (!deleted) return notFound("Pipeline");
    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

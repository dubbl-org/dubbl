import { db } from "@/lib/db";
import { deal } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const d = await db.query.deal.findFirst({
      where: and(
        eq(deal.id, id),
        eq(deal.organizationId, ctx.organizationId),
        notDeleted(deal.deletedAt)
      ),
      with: { contact: true, assignedUser: true, activities: true, pipeline: true },
    });

    if (!d) return notFound("Deal");
    return ok({ deal: d });
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  valueCents: z.number().int().min(0).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
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
      .update(deal)
      .set({ ...parsed, updatedAt: new Date() })
      .where(and(eq(deal.id, id), eq(deal.organizationId, ctx.organizationId)))
      .returning();

    if (!updated) return notFound("Deal");
    return ok({ deal: updated });
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
      .update(deal)
      .set(softDelete())
      .where(and(eq(deal.id, id), eq(deal.organizationId, ctx.organizationId)))
      .returning();

    if (!deleted) return notFound("Deal");

    logAudit({
      ctx,
      action: "delete",
      entityType: "deal",
      entityId: id,
      changes: deleted as Record<string, unknown>,
      request,
    });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

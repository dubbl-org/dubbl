import { db } from "@/lib/db";
import { contractor } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  company: z.string().nullable().optional(),
  taxId: z.string().nullable().optional(),
  hourlyRate: z.number().int().nullable().optional(),
  currency: z.string().max(3).optional(),
  bankAccountNumber: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contractors");

    const c = await db.query.contractor.findFirst({
      where: and(
        eq(contractor.id, id),
        eq(contractor.organizationId, ctx.organizationId),
        notDeleted(contractor.deletedAt)
      ),
      with: { payments: true },
    });

    if (!c) return notFound("Contractor");
    return ok({ contractor: c });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contractors");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(contractor)
      .set({ ...parsed, updatedAt: new Date() })
      .where(and(
        eq(contractor.id, id),
        eq(contractor.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!updated) return notFound("Contractor");

    logAudit({ ctx, action: "update", entityType: "contractor", entityId: id, changes: parsed, request });

    return ok({ contractor: updated });
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
    requireRole(ctx, "manage:contractors");

    const [deleted] = await db
      .update(contractor)
      .set(softDelete())
      .where(and(
        eq(contractor.id, id),
        eq(contractor.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!deleted) return notFound("Contractor");

    logAudit({ ctx, action: "delete", entityType: "contractor", entityId: id, request });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

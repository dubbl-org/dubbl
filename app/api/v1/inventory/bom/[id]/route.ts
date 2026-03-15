import { db } from "@/lib/db";
import { billOfMaterials } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { ok, notFound, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const bom = await db.query.billOfMaterials.findFirst({
      where: and(
        eq(billOfMaterials.id, id),
        eq(billOfMaterials.organizationId, ctx.organizationId),
        notDeleted(billOfMaterials.deletedAt)
      ),
      with: {
        assemblyItem: true,
        components: { with: { componentItem: true } },
      },
    });

    if (!bom) return notFound("BOM");

    // Calculate total cost
    const componentCost = bom.components.reduce((sum, c) => {
      const qty = parseFloat(c.quantity);
      const wastage = parseFloat(c.wastagePercent || "0") / 100;
      const effectiveQty = qty * (1 + wastage);
      return sum + effectiveQty * (c.componentItem?.purchasePrice || 0);
    }, 0);
    const totalCost = Math.round(componentCost) + bom.laborCostCents + bom.overheadCostCents;

    return ok({ bom, costBreakdown: { componentCost: Math.round(componentCost), laborCost: bom.laborCostCents, overheadCost: bom.overheadCostCents, totalCost } });
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  laborCostCents: z.number().int().min(0).optional(),
  overheadCostCents: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(billOfMaterials)
      .set({ ...parsed, updatedAt: new Date() })
      .where(and(eq(billOfMaterials.id, id), eq(billOfMaterials.organizationId, ctx.organizationId)))
      .returning();

    if (!updated) return notFound("BOM");
    return ok({ bom: updated });
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
    requireRole(ctx, "manage:inventory");

    const [deleted] = await db
      .update(billOfMaterials)
      .set(softDelete())
      .where(and(eq(billOfMaterials.id, id), eq(billOfMaterials.organizationId, ctx.organizationId)))
      .returning();

    if (!deleted) return notFound("BOM");

    logAudit({
      ctx,
      action: "delete",
      entityType: "bill_of_materials",
      entityId: id,
      changes: deleted as Record<string, unknown>,
      request,
    });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

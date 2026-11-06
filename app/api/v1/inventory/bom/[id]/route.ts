import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { logAudit } from "@/lib/api/audit";
import { ok, notFound, handleError } from "@/lib/api/response";
import { deleteBom, getBom, updateBom } from "@/lib/api/assembly";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const result = await getBom(ctx.organizationId, id);
    if (!result) return notFound("BOM");
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  assemblyItemId: z.string().uuid().optional(),
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
    const parsed = updateSchema.parse(await request.json());
    const result = await updateBom(ctx, id, parsed);
    logAudit({ ctx, action: "update", entityType: "bill_of_materials", entityId: id, changes: parsed, request });
    return ok({ bom: result?.bom, costBreakdown: result?.costBreakdown });
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
    const deleted = await deleteBom(ctx, id);
    logAudit({ ctx, action: "delete", entityType: "bill_of_materials", entityId: id, changes: deleted as Record<string, unknown>, request });
    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

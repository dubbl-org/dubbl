import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, created, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { createBom, listBoms } from "@/lib/api/assembly";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    return ok({ data: await listBoms(ctx.organizationId) });
  } catch (err) {
    return handleError(err);
  }
}

const componentSchema = z.object({
  componentItemId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  wastagePercent: z.coerce.number().min(0).max(1000).optional(),
});

const createSchema = z.object({
  assemblyItemId: z.string().uuid(),
  name: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  laborCostCents: z.number().int().min(0).optional(),
  overheadCostCents: z.number().int().min(0).optional(),
  components: z.array(componentSchema).optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    const parsed = createSchema.parse(await request.json());
    const result = await createBom(ctx, parsed);
    if (result) {
      logAudit({ ctx, action: "create", entityType: "bill_of_materials", entityId: result.bom.id, changes: { name: result.bom.name }, request });
    }
    return created({ bom: result?.bom, costBreakdown: result?.costBreakdown });
  } catch (err) {
    return handleError(err);
  }
}

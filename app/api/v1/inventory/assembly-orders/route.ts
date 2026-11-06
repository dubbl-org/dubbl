import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, created, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { createAssemblyOrder, listAssemblyOrders } from "@/lib/api/assembly";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    return ok({ data: await listAssemblyOrders(ctx.organizationId) });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  bomId: z.string().uuid(),
  quantity: z.number().int().min(1),
  notes: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    const parsed = createSchema.parse(await request.json());
    const order = await createAssemblyOrder(ctx, parsed);
    logAudit({ ctx, action: "create", entityType: "assembly_order", entityId: order.id, changes: parsed, request });
    return created({ order });
  } catch (err) {
    return handleError(err);
  }
}

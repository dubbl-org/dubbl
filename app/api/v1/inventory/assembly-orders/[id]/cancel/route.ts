import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { cancelAssemblyOrder } from "@/lib/api/assembly";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    const order = await cancelAssemblyOrder(ctx, id);
    logAudit({ ctx, action: "cancel", entityType: "assembly_order", entityId: id, changes: { status: "cancelled" }, request });
    return ok({ order });
  } catch (err) {
    return handleError(err);
  }
}

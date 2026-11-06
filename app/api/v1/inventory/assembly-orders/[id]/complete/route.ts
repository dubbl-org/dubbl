import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { buildAssemblyOrder } from "@/lib/api/assembly";

/** Build the order: use up the parts, add the finished items, post one entry. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const result = await buildAssemblyOrder(ctx, id);

    await logAudit({
      ctx,
      action: "complete",
      entityType: "assembly_order",
      entityId: id,
      changes: {
        quantity: result.order.quantity,
        totalCost: result.totalCost,
        unitCost: result.unitCost,
        journalEntryId: result.journalEntryId,
      },
      request,
    });

    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}

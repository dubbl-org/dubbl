import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { removeBomComponent, updateBomComponent } from "@/lib/api/assembly";
import { z } from "zod";

const updateSchema = z.object({
  quantity: z.coerce.number().positive().optional(),
  wastagePercent: z.coerce.number().min(0).max(1000).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; componentId: string }> }
) {
  try {
    const { id, componentId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    const parsed = updateSchema.parse(await request.json());
    const component = await updateBomComponent(ctx, id, componentId, parsed);
    return ok({ component });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; componentId: string }> }
) {
  try {
    const { id, componentId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    await removeBomComponent(ctx, id, componentId);
    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

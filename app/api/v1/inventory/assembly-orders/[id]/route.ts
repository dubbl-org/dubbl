import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { cancelAssemblyOrder, startAssemblyOrder, updateAssemblyOrder } from "@/lib/api/assembly";
import { z } from "zod";

// Building goes through POST /complete, which posts the journal entry.
const updateSchema = z.object({
  status: z.enum(["in_progress", "cancelled"]).optional(),
  quantity: z.number().int().min(1).optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    const { status, ...fields } = updateSchema.parse(await request.json());

    let order = null;
    if (fields.quantity !== undefined || fields.notes !== undefined) {
      order = await updateAssemblyOrder(ctx, id, fields);
    }
    if (status === "in_progress") order = await startAssemblyOrder(ctx, id);
    if (status === "cancelled") order = await cancelAssemblyOrder(ctx, id);
    return ok({ order });
  } catch (err) {
    return handleError(err);
  }
}

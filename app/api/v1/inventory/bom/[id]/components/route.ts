import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, created, notFound, error, handleError } from "@/lib/api/response";
import { addBomComponent, getBom, removeBomComponent } from "@/lib/api/assembly";
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
    return ok({ components: result.bom.components });
  } catch (err) {
    return handleError(err);
  }
}

const addSchema = z.object({
  componentItemId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  wastagePercent: z.coerce.number().min(0).max(1000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    const parsed = addSchema.parse(await request.json());
    const component = await addBomComponent(ctx, id, parsed);
    return created({ component });
  } catch (err) {
    return handleError(err);
  }
}

/** Kept for older clients: DELETE ?componentId=... (prefer /components/[componentId]). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    const componentId = new URL(request.url).searchParams.get("componentId");
    if (!componentId) return error("componentId is required", 400);
    await removeBomComponent(ctx, id, componentId);
    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError } from "@/lib/api/response";
import { startAssemblyOrder } from "@/lib/api/assembly";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");
    return ok({ order: await startAssemblyOrder(ctx, id) });
  } catch (err) {
    return handleError(err);
  }
}

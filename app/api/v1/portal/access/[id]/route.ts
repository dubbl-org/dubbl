import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, notFound, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { revokePortalAccess } from "@/lib/api/portal-access";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");

    if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound("Portal access");
    const revoked = await revokePortalAccess(ctx.organizationId, id);
    if (!revoked) return notFound("Portal access");

    logAudit({ ctx, action: "delete", entityType: "portal_access", entityId: id, request });
    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

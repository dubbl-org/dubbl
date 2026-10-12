import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError, validationError } from "@/lib/api/response";
import { listPortalAccess } from "@/lib/api/portal-access";

/**
 * GET /api/v1/portal/access
 *
 * Customer-portal links. Live links only by default; `status=all` also returns
 * revoked and expired ones. Optional `contactId`. Each row has the contact,
 * status (active | expired | revoked), expiry, last portal activity and count.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");
    const url = new URL(request.url);
    const contactId = url.searchParams.get("contactId");
    if (contactId && !/^[0-9a-f-]{36}$/i.test(contactId)) {
      return validationError("contactId must be a UUID");
    }

    const data = await listPortalAccess(ctx.organizationId, {
      includeInactive: url.searchParams.get("status") === "all",
      contactId,
    });

    return ok({ data });
  } catch (err) {
    return handleError(err);
  }
}

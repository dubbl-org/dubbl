import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { ok, handleError, validationError } from "@/lib/api/response";
import { listPortalActivity } from "@/lib/api/portal-access";

/**
 * GET /api/v1/portal/activity
 *
 * Recent customer-portal activity (opened portal, viewed invoices, accepted
 * quotes…), newest first. Optional: contactId, limit (max 200, default 50).
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
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));

    const data = await listPortalActivity(ctx.organizationId, { limit, contactId });
    return ok({ data });
  } catch (err) {
    return handleError(err);
  }
}

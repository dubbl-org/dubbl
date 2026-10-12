import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { created, error, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { createPortalInvite, PortalAccessError } from "@/lib/api/portal-access";
import { z } from "zod";

const schema = z.object({
  contactId: z.string().uuid(),
  expiresInDays: z.number().min(1).max(365).optional().default(30),
  /** Email the link to the contact using the workspace's SMTP settings. */
  sendEmail: z.boolean().optional().default(false),
  message: z.string().max(2000).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");

    const body = await request.json();
    const parsed = schema.parse(body);

    const result = await createPortalInvite(ctx.organizationId, {
      ...parsed,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin,
    });

    logAudit({ ctx, action: "create", entityType: "portal_access", entityId: result.access.id, request });

    return created(result);
  } catch (err) {
    if (err instanceof PortalAccessError) return error(err.message, err.status);
    return handleError(err);
  }
}

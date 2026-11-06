import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created, validationError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import {
  EmailSettingsError,
  emailSettingsSchema,
  getEmailSettings,
  removeEmailSettings,
  saveEmailSettings,
} from "@/lib/email/email-settings";
import { documentsFromAddress } from "@/lib/email/senders";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    return ok({
      emailConfig: await getEmailSettings(ctx.organizationId),
      // The shared sender used until the organization's own server is verified
      platformFrom: documentsFromAddress(),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:integrations");
    const parsed = emailSettingsSchema.parse(await request.json());
    const result = await saveEmailSettings(ctx.organizationId, parsed);
    logAudit({ ctx, action: result.created ? "create" : "update", entityType: "email_config", entityId: result.emailConfig!.id, request });
    return result.created ? created({ emailConfig: result.emailConfig }) : ok({ emailConfig: result.emailConfig });
  } catch (err) {
    if (err instanceof EmailSettingsError) return validationError(err.message);
    return handleError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:integrations");
    const result = await removeEmailSettings(ctx.organizationId);
    logAudit({ ctx, action: "delete", entityType: "email_config", entityId: ctx.organizationId, request });
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}

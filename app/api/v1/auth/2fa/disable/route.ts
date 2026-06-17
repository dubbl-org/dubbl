import { db } from "@/lib/db";
import { userTotp } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { ok, error, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { verifyTwoFactor } from "@/lib/auth/two-factor";

const bodySchema = z.object({
  // Require a current TOTP or backup code to disable, so a hijacked session
  // cannot silently turn 2FA off.
  code: z.string().trim().min(1, "A current 2FA code is required to disable"),
});

/**
 * POST /api/v1/auth/2fa/disable
 *
 * Disables TOTP two-factor authentication for the authenticated user. Requires a
 * valid current TOTP code or a backup code. Deletes the stored secret and backup
 * codes entirely (a fresh enroll is required to re-enable).
 *
 * Body: { code: "123456" }. Returns: { enabled: false }.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const { code } = bodySchema.parse(body);

    const row = await db.query.userTotp.findFirst({
      where: eq(userTotp.userId, ctx.userId),
    });
    if (!row || !row.enabled) {
      return error("Two-factor authentication is not enabled", 400);
    }

    const valid = await verifyTwoFactor(ctx.userId, code);
    if (!valid) {
      return error("Invalid verification code", 400);
    }

    await db.delete(userTotp).where(eq(userTotp.userId, ctx.userId));

    logAudit({
      ctx,
      action: "two_factor.disabled",
      entityType: "user_totp",
      entityId: ctx.userId,
      request,
    });

    return ok({ enabled: false });
  } catch (err) {
    return handleError(err);
  }
}

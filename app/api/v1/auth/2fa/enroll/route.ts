import { db } from "@/lib/db";
import { userTotp, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { ok, error, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { generateTotpSecret, buildOtpAuthUri } from "@/lib/auth/totp";

const ISSUER = "dubbl";

/**
 * POST /api/v1/auth/2fa/enroll
 *
 * Begins (or restarts) TOTP enrollment for the authenticated user. Generates a
 * fresh base32 secret and stores it in a pending (enabled=false) row, then
 * returns the secret and an otpauth:// URI for the authenticator app / QR code.
 *
 * Enrollment is not active until POST /api/v1/auth/2fa/verify succeeds with a
 * valid code. Calling this while already enabled is rejected — use disable
 * first. Returns: { secret, otpauthUri }.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
      columns: { email: true },
    });
    if (!user) return error("User not found", 404);

    const existing = await db.query.userTotp.findFirst({
      where: eq(userTotp.userId, ctx.userId),
    });
    if (existing?.enabled) {
      return error("Two-factor authentication is already enabled", 409);
    }

    const secret = generateTotpSecret();

    if (existing) {
      await db
        .update(userTotp)
        .set({ secret, enabled: false, backupCodes: [] })
        .where(eq(userTotp.userId, ctx.userId));
    } else {
      await db
        .insert(userTotp)
        .values({ userId: ctx.userId, secret, enabled: false });
    }

    const otpauthUri = buildOtpAuthUri({
      secret,
      accountName: user.email,
      issuer: ISSUER,
    });

    logAudit({
      ctx,
      action: "two_factor.enroll_started",
      entityType: "user_totp",
      entityId: ctx.userId,
      request,
    });

    return ok({ secret, otpauthUri, issuer: ISSUER });
  } catch (err) {
    return handleError(err);
  }
}

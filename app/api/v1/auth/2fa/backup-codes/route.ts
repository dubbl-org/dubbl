import { db } from "@/lib/db";
import { userTotp } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { ok, error, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { generateBackupCodes } from "@/lib/auth/totp";
import {
  hashBackupCodes,
  verifyTwoFactor,
  BACKUP_CODE_COUNT,
} from "@/lib/auth/two-factor";

const bodySchema = z.object({
  // Require a current TOTP or backup code to regenerate, so a hijacked session
  // cannot mint a fresh set of recovery codes.
  code: z.string().trim().min(1, "A current 2FA code is required"),
});

/**
 * GET /api/v1/auth/2fa/backup-codes
 *
 * Returns how many unused backup recovery codes remain for the authenticated
 * user (the plaintext codes themselves are never retrievable after creation).
 * Returns: { enabled: boolean, remaining: number }.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const row = await db.query.userTotp.findFirst({
      where: eq(userTotp.userId, ctx.userId),
      columns: { enabled: true, backupCodes: true },
    });
    if (!row || !row.enabled) {
      return error("Two-factor authentication is not enabled", 400);
    }
    return ok({
      enabled: true,
      remaining: ((row.backupCodes ?? []) as string[]).length,
    });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/v1/auth/2fa/backup-codes
 *
 * Regenerates the set of single-use backup recovery codes for the authenticated
 * user, invalidating all previous codes. Requires a valid current TOTP code or
 * an existing backup code.
 *
 * Body: { code: "123456" }. Returns: { backupCodes: string[] } (shown once).
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

    const { plain } = generateBackupCodes(BACKUP_CODE_COUNT);
    const hashed = await hashBackupCodes(plain);

    await db
      .update(userTotp)
      .set({ backupCodes: hashed })
      .where(eq(userTotp.userId, ctx.userId));

    logAudit({
      ctx,
      action: "two_factor.backup_codes_regenerated",
      entityType: "user_totp",
      entityId: ctx.userId,
      request,
    });

    return ok({ backupCodes: plain });
  } catch (err) {
    return handleError(err);
  }
}

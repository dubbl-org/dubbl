import { db } from "@/lib/db";
import { userTotp } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthContext } from "@/lib/api/auth-context";
import { ok, error, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { verifyTotp, generateBackupCodes } from "@/lib/auth/totp";
import { hashBackupCodes, BACKUP_CODE_COUNT } from "@/lib/auth/two-factor";

const bodySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Code must be a 6-digit TOTP code"),
});

/**
 * POST /api/v1/auth/2fa/verify
 *
 * Completes TOTP enrollment by verifying the first code from the authenticator
 * app against the pending secret. On success, flips enabled=true and returns a
 * one-time set of backup recovery codes (plaintext, shown only here).
 *
 * Body: { code: "123456" }. Returns: { enabled: true, backupCodes: string[] }.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const { code } = bodySchema.parse(body);

    const row = await db.query.userTotp.findFirst({
      where: eq(userTotp.userId, ctx.userId),
    });
    if (!row) {
      return error("No pending enrollment. Call enroll first.", 400);
    }
    if (row.enabled) {
      return error("Two-factor authentication is already enabled", 409);
    }

    if (!verifyTotp(row.secret, code)) {
      return error("Invalid verification code", 400);
    }

    const { plain } = generateBackupCodes(BACKUP_CODE_COUNT);
    const hashed = await hashBackupCodes(plain);

    await db
      .update(userTotp)
      .set({ enabled: true, backupCodes: hashed })
      .where(eq(userTotp.userId, ctx.userId));

    logAudit({
      ctx,
      action: "two_factor.enabled",
      entityType: "user_totp",
      entityId: ctx.userId,
      request,
    });

    return ok({ enabled: true, backupCodes: plain });
  } catch (err) {
    return handleError(err);
  }
}

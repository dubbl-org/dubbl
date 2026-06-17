import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userTotp } from "@/lib/db/schema";
import { verifyTotp } from "./totp";

const BACKUP_CODE_COUNT = 10;

/** Hash a batch of plaintext backup codes for storage. */
export async function hashBackupCodes(plain: string[]): Promise<string[]> {
  return Promise.all(plain.map((code) => bcrypt.hash(code, 10)));
}

/**
 * Whether a user has 2FA fully enabled. Used as the login verification hook.
 * Returns false when no row exists or enrollment is incomplete.
 */
export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const row = await db.query.userTotp.findFirst({
    where: eq(userTotp.userId, userId),
    columns: { enabled: true },
  });
  return !!row?.enabled;
}

/**
 * Verify a login challenge for a user that has 2FA enabled. Accepts either a
 * 6-digit TOTP code or one of the user's single-use backup codes. A consumed
 * backup code is removed atomically. Returns true on success.
 *
 * Safe to call during the credentials authorize() flow — it never throws.
 */
export async function verifyTwoFactor(
  userId: string,
  code: string
): Promise<boolean> {
  const row = await db.query.userTotp.findFirst({
    where: eq(userTotp.userId, userId),
  });
  if (!row || !row.enabled) return false;

  const cleaned = (code || "").trim();
  if (!cleaned) return false;

  // Plain 6-digit input -> try TOTP.
  if (/^\d{6}$/.test(cleaned.replace(/\s+/g, ""))) {
    if (verifyTotp(row.secret, cleaned)) return true;
  }

  // Otherwise try backup codes (single-use).
  const codes = (row.backupCodes ?? []) as string[];
  for (let i = 0; i < codes.length; i++) {
    if (await bcrypt.compare(cleaned, codes[i])) {
      const remaining = codes.filter((_, idx) => idx !== i);
      await db
        .update(userTotp)
        .set({ backupCodes: remaining })
        .where(eq(userTotp.userId, userId));
      return true;
    }
  }
  return false;
}

export { BACKUP_CODE_COUNT };

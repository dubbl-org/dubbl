import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { appSession, users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";

/** Redirects the native apps may receive a sign-in code on. */
export const APP_REDIRECT_URIS = ["dubbl://auth/callback"];
export const APP_PLATFORMS = ["ios"] as const;

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

export const ACCESS_TOKEN_PREFIX = "dat_";
export const REFRESH_TOKEN_PREFIX = "drt_";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("hex")}`;
}

/** A fresh access/refresh pair plus the hashes and expiries to store. */
export function issueTokenPair() {
  const accessToken = generateToken(ACCESS_TOKEN_PREFIX);
  const refreshToken = generateToken(REFRESH_TOKEN_PREFIX);
  const now = Date.now();
  return {
    accessToken,
    refreshToken,
    row: {
      accessTokenHash: hashToken(accessToken),
      accessExpiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
      refreshTokenHash: hashToken(refreshToken),
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  };
}

/**
 * Resolve a native-app access token to its user. Returns null when the token is
 * unknown, expired, or was issued before the user signed out of all devices.
 */
export async function resolveAppAccessToken(
  rawToken: string
): Promise<{ userId: string; sessionId: string } | null> {
  const row = await db.query.appSession.findFirst({
    where: eq(appSession.accessTokenHash, hashToken(rawToken)),
  });
  if (!row || row.accessExpiresAt < new Date()) return null;

  if (await isRevokedForUser(row.userId, row.createdAt)) {
    await db.delete(appSession).where(eq(appSession.id, row.id));
    return null;
  }

  db.update(appSession)
    .set({ lastUsedAt: new Date() })
    .where(eq(appSession.id, row.id))
    .execute()
    .catch(() => {});

  return { userId: row.userId, sessionId: row.id };
}

/** True when "sign out of all devices" happened after this session started. */
export async function isRevokedForUser(userId: string, createdAt: Date): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { sessionRevokedAt: true },
  });
  return !!user?.sessionRevokedAt && user.sessionRevokedAt > createdAt;
}

/** The app's bearer access token on this request, if it carries one. */
export function getAppBearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith(`Bearer ${ACCESS_TOKEN_PREFIX}`)) return null;
  return header.slice(7);
}

/**
 * The signed-in user for account-level routes (not tied to an organization):
 * a native-app bearer token, or the browser session.
 */
export async function getRequestUserId(request: Request): Promise<string | null> {
  const bearer = getAppBearer(request);
  if (bearer) {
    const resolved = await resolveAppAccessToken(bearer);
    return resolved?.userId ?? null;
  }
  const session = await auth();
  return session?.user?.id ?? null;
}

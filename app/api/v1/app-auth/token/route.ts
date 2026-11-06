import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { appAuthCode, appSession, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  hashToken,
  isRevokedForUser,
  issueTokenPair,
} from "@/lib/api/app-auth";

const tokenSchema = z.discriminatedUnion("grant_type", [
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string().min(1),
    code_verifier: z.string().min(43).max(128),
    redirect_uri: z.string().min(1),
  }),
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string().min(1),
  }),
]);

function grantError(description: string) {
  return NextResponse.json({ error: "invalid_grant", error_description: description }, { status: 400 });
}

async function tokenResponse(userId: string, accessToken: string, refreshToken: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, name: true, email: true, image: true },
  });
  return NextResponse.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    user,
  });
}

/** Exchange a sign-in code (with its PKCE verifier) or a refresh token for a token pair. */
export async function POST(request: Request) {
  try {
    const parsed = tokenSchema.parse(await request.json());

    if (parsed.grant_type === "authorization_code") {
      const code = await db.query.appAuthCode.findFirst({
        where: eq(appAuthCode.codeHash, hashToken(parsed.code)),
      });
      if (!code) return grantError("Invalid authorization code");

      // Codes are single use, whatever happens next.
      await db.delete(appAuthCode).where(eq(appAuthCode.id, code.id));

      if (code.expiresAt < new Date()) return grantError("Authorization code expired");
      if (code.redirectUri !== parsed.redirect_uri) return grantError("redirect_uri mismatch");

      const challenge = createHash("sha256").update(parsed.code_verifier).digest("base64url");
      if (challenge !== code.codeChallenge) return grantError("PKCE verification failed");

      const pair = issueTokenPair();
      await db.insert(appSession).values({
        userId: code.userId,
        platform: code.platform,
        deviceName: code.deviceName,
        ...pair.row,
      });
      return tokenResponse(code.userId, pair.accessToken, pair.refreshToken);
    }

    const existing = await db.query.appSession.findFirst({
      where: eq(appSession.refreshTokenHash, hashToken(parsed.refresh_token)),
    });
    if (!existing) return grantError("Invalid refresh token");

    if (existing.refreshExpiresAt < new Date() || (await isRevokedForUser(existing.userId, existing.createdAt))) {
      await db.delete(appSession).where(eq(appSession.id, existing.id));
      return grantError("Session expired");
    }

    const pair = issueTokenPair();
    await db.update(appSession).set(pair.row).where(eq(appSession.id, existing.id));
    return tokenResponse(existing.userId, pair.accessToken, pair.refreshToken);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_request", error_description: err.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    console.error("App token error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

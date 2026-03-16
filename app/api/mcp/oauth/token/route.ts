import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import {
  mcpOAuthCode,
  mcpAccessToken,
  mcpRefreshToken,
  member,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { MemberRole } from "@/lib/plans";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function corsJson(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return Response.json(data, { ...init, headers });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("hex")}`;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  try {
    const body = await request.formData().catch(() => null);
    let params: Record<string, string> = {};

    if (body) {
      body.forEach((value, key) => {
        params[key] = value.toString();
      });
    } else {
      // Try JSON body
      const json = await request.json().catch(() => ({}));
      params = json as Record<string, string>;
    }

    const grantType = params.grant_type;

    if (grantType === "authorization_code") {
      return handleAuthorizationCode(params);
    } else if (grantType === "refresh_token") {
      return handleRefreshToken(params);
    } else {
      return corsJson(
        { error: "unsupported_grant_type" },
        { status: 400 }
      );
    }
  } catch (err) {
    console.error("Token endpoint error:", err);
    return corsJson({ error: "server_error" }, { status: 500 });
  }
}

async function handleAuthorizationCode(params: Record<string, string>) {
  const { code, redirect_uri, code_verifier, client_id } = params;

  if (!code || !redirect_uri || !code_verifier || !client_id) {
    return corsJson(
      {
        error: "invalid_request",
        error_description:
          "Missing required parameters: code, redirect_uri, code_verifier, client_id",
      },
      { status: 400 }
    );
  }

  // Look up auth code
  const codeHash = hashToken(code);
  const authCode = await db.query.mcpOAuthCode.findFirst({
    where: eq(mcpOAuthCode.codeHash, codeHash),
  });

  if (!authCode) {
    return corsJson(
      { error: "invalid_grant", error_description: "Invalid authorization code" },
      { status: 400 }
    );
  }

  // Validate expiry
  if (authCode.expiresAt < new Date()) {
    // Clean up expired code
    await db.delete(mcpOAuthCode).where(eq(mcpOAuthCode.id, authCode.id));
    return corsJson(
      { error: "invalid_grant", error_description: "Authorization code expired" },
      { status: 400 }
    );
  }

  // Validate client_id and redirect_uri
  if (authCode.clientId !== client_id) {
    return corsJson(
      { error: "invalid_grant", error_description: "client_id mismatch" },
      { status: 400 }
    );
  }

  if (authCode.redirectUri !== redirect_uri) {
    return corsJson(
      { error: "invalid_grant", error_description: "redirect_uri mismatch" },
      { status: 400 }
    );
  }

  // Verify PKCE
  const expectedChallenge = createHash("sha256")
    .update(code_verifier)
    .digest("base64url");

  if (expectedChallenge !== authCode.codeChallenge) {
    return corsJson(
      { error: "invalid_grant", error_description: "PKCE verification failed" },
      { status: 400 }
    );
  }

  // Get user's role in org
  const mem = await db.query.member.findFirst({
    where: and(
      eq(member.organizationId, authCode.organizationId),
      eq(member.userId, authCode.userId)
    ),
  });

  const role: MemberRole = (mem?.role as MemberRole) ?? "member";

  // Delete the used code
  await db.delete(mcpOAuthCode).where(eq(mcpOAuthCode.id, authCode.id));

  // Generate tokens
  const accessTokenRaw = generateToken("mcp_at_");
  const refreshTokenRaw = generateToken("mcp_rt_");

  const accessTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  const refreshTokenExpiry = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ); // 30 days

  const [accessToken] = await db
    .insert(mcpAccessToken)
    .values({
      tokenHash: hashToken(accessTokenRaw),
      userId: authCode.userId,
      organizationId: authCode.organizationId,
      role,
      clientId: authCode.clientId,
      scopes: authCode.scopes,
      expiresAt: accessTokenExpiry,
    })
    .returning();

  await db.insert(mcpRefreshToken).values({
    tokenHash: hashToken(refreshTokenRaw),
    accessTokenId: accessToken.id,
    expiresAt: refreshTokenExpiry,
  });

  return corsJson({
    access_token: accessTokenRaw,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshTokenRaw,
    scope: authCode.scopes || "mcp",
  });
}

async function handleRefreshToken(params: Record<string, string>) {
  const { refresh_token, client_id } = params;

  if (!refresh_token || !client_id) {
    return corsJson(
      {
        error: "invalid_request",
        error_description: "Missing required parameters: refresh_token, client_id",
      },
      { status: 400 }
    );
  }

  const refreshHash = hashToken(refresh_token);
  const storedRefresh = await db.query.mcpRefreshToken.findFirst({
    where: eq(mcpRefreshToken.tokenHash, refreshHash),
    with: { accessToken: true },
  });

  if (!storedRefresh) {
    return corsJson(
      { error: "invalid_grant", error_description: "Invalid refresh token" },
      { status: 400 }
    );
  }

  if (storedRefresh.expiresAt < new Date()) {
    await db
      .delete(mcpRefreshToken)
      .where(eq(mcpRefreshToken.id, storedRefresh.id));
    return corsJson(
      { error: "invalid_grant", error_description: "Refresh token expired" },
      { status: 400 }
    );
  }

  const oldAccessToken = storedRefresh.accessToken;
  if (oldAccessToken.clientId !== client_id) {
    return corsJson(
      { error: "invalid_grant", error_description: "client_id mismatch" },
      { status: 400 }
    );
  }


  // Delete old refresh token
  await db
    .delete(mcpRefreshToken)
    .where(eq(mcpRefreshToken.id, storedRefresh.id));

  // Get current role
  const mem = await db.query.member.findFirst({
    where: and(
      eq(member.organizationId, oldAccessToken.organizationId),
      eq(member.userId, oldAccessToken.userId)
    ),
  });

  const role: MemberRole = (mem?.role as MemberRole) ?? "member";

  // Generate new tokens
  const newAccessTokenRaw = generateToken("mcp_at_");
  const newRefreshTokenRaw = generateToken("mcp_rt_");

  const accessTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
  const refreshTokenExpiry = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  );

  const [newAccessToken] = await db
    .insert(mcpAccessToken)
    .values({
      tokenHash: hashToken(newAccessTokenRaw),
      userId: oldAccessToken.userId,
      organizationId: oldAccessToken.organizationId,
      role,
      clientId: oldAccessToken.clientId,
      scopes: oldAccessToken.scopes,
      expiresAt: accessTokenExpiry,
    })
    .returning();

  await db.insert(mcpRefreshToken).values({
    tokenHash: hashToken(newRefreshTokenRaw),
    accessTokenId: newAccessToken.id,
    expiresAt: refreshTokenExpiry,
  });

  return corsJson({
    access_token: newAccessTokenRaw,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: newRefreshTokenRaw,
    scope: oldAccessToken.scopes || "mcp",
  });
}

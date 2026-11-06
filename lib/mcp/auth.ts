import { createHash } from "crypto";
import { db } from "@/lib/db";
import { mcpAccessToken } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { AuthContext } from "@/lib/api/auth-context";
import { AuthError, resolveMemberContext } from "@/lib/api/auth-context";
import { isRevokedForUser } from "@/lib/api/app-auth";

export async function resolveToken(bearerToken: string): Promise<AuthContext> {
  const hash = createHash("sha256").update(bearerToken).digest("hex");

  const token = await db.query.mcpAccessToken.findFirst({
    where: eq(mcpAccessToken.tokenHash, hash),
  });

  if (!token) {
    throw new AuthError("Invalid access token", 401);
  }

  if (token.expiresAt < new Date()) {
    throw new AuthError("Access token expired", 401);
  }

  // "Sign out everywhere" also ends MCP connections made before it
  if (await isRevokedForUser(token.userId, token.createdAt)) {
    await db.delete(mcpAccessToken).where(eq(mcpAccessToken.id, token.id));
    throw new AuthError("Access token revoked", 401);
  }

  // The token acts as the user's current membership: a removed member loses
  // access at once, and role or custom role changes apply on the next call.
  const ctx = await resolveMemberContext(token.userId, token.organizationId);
  if (!ctx) {
    await db.delete(mcpAccessToken).where(eq(mcpAccessToken.id, token.id));
    throw new AuthError("No longer a member of this organization", 401);
  }

  return ctx;
}

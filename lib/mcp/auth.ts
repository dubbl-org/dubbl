import { createHash } from "crypto";
import { db } from "@/lib/db";
import { mcpAccessToken, member, subscription } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { PLAN_LIMITS } from "@/lib/plans";
import type { AuthContext } from "@/lib/api/auth-context";
import { AuthError } from "@/lib/api/auth-context";
import type { MemberRole } from "@/lib/plans";

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

  // Check org subscription is still on a paid plan
  const sub = await db.query.subscription.findFirst({
    where: eq(subscription.organizationId, token.organizationId),
  });

  const plan = sub?.plan ?? "free";
  if (!PLAN_LIMITS[plan].apiAccess) {
    throw new AuthError(
      "MCP access requires a Pro or Business plan",
      403
    );
  }

  // Verify membership still exists
  const mem = await db.query.member.findFirst({
    where: and(
      eq(member.organizationId, token.organizationId),
      eq(member.userId, token.userId)
    ),
  });

  const role = (mem?.role ?? token.role) as MemberRole;

  return {
    userId: token.userId,
    organizationId: token.organizationId,
    role,
  };
}

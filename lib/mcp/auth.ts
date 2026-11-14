import { createHash } from "crypto";
import { db } from "@/lib/db";
import { mcpAccessToken, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
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

  // Verify membership still exists
  const mem = await db.query.member.findFirst({
    where: and(
      eq(member.organizationId, token.organizationId),
      eq(member.userId, token.userId)
    ),
  });

  // Fail closed: removing a member must revoke their MCP access, not leave the
  // token working with its old role.
  if (!mem) throw new AuthError("Access token owner is no longer a member", 401);

  const role = mem.role as MemberRole;

  return {
    userId: token.userId,
    organizationId: token.organizationId,
    role,
  };
}

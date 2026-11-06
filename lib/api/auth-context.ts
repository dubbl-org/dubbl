import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, apiKey, advisorAccess, customRole, users } from "@/lib/db/schema";
import { subscription } from "@/lib/db/schema/billing";
import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";
import { getEffectiveLimits, ADVISOR_PERMISSIONS, type MemberRole } from "@/lib/plans";
import { getAppBearer, resolveAppAccessToken } from "@/lib/api/app-auth";
import { isSelfHostedUnlimited } from "@/lib/site-settings";

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: MemberRole;
  customRoleId?: string;
  permissions?: string[];
  isAdvisor?: boolean;
  advisorRole?: string;
}

async function resolveCustomRole(
  mem: { role: string; customRoleId: string | null }
): Promise<{ customRoleId?: string; permissions?: string[] }> {
  if (!mem.customRoleId) return {};
  const role = await db.query.customRole.findFirst({
    where: eq(customRole.id, mem.customRoleId),
  });
  if (!role) return {};
  return {
    customRoleId: role.id,
    permissions: role.permissions as string[],
  };
}

/**
 * The auth context for a user's current membership of an organization, with
 * any custom role applied. Null when they are not (or no longer) a member.
 * Used by credentials that act as a member: API keys and MCP tokens.
 */
export async function resolveMemberContext(
  userId: string,
  organizationId: string
): Promise<AuthContext | null> {
  const mem = await db.query.member.findFirst({
    where: and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
  });
  if (!mem) return null;
  return {
    userId,
    organizationId,
    role: mem.role as MemberRole,
    ...(await resolveCustomRole(mem)),
  };
}

export async function getAuthContext(
  request: Request,
  organizationId?: string
): Promise<AuthContext> {
  // Try API key auth first
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer dk_")) {
    const rawKey = authHeader.slice(7);
    const hash = createHash("sha256").update(rawKey).digest("hex");

    const key = await db.query.apiKey.findFirst({
      where: eq(apiKey.keyHash, hash),
    });

    if (!key) throw new AuthError("Invalid API key", 401);
    if (key.expiresAt && key.expiresAt < new Date()) {
      throw new AuthError("API key expired", 401);
    }

    // Check the org still has API access
    const sub = await db.query.subscription.findFirst({
      where: eq(subscription.organizationId, key.organizationId),
    });
    const limits = getEffectiveLimits(sub ?? null, await isSelfHostedUnlimited());
    if (!limits.apiAccess) {
      throw new AuthError("This organization's plan doesn't include API access", 403);
    }

    // A key acts as the member who created it. Once that person leaves the
    // organization the key is disabled (the API Keys page marks it as such).
    const ctx = await resolveMemberContext(key.createdBy, key.organizationId);
    if (!ctx) {
      throw new AuthError(
        "API key disabled: the member who created it is no longer in this organization",
        401
      );
    }

    // Update last used (fire and forget)
    db.update(apiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKey.id, key.id))
      .execute()
      .catch(() => {});

    return ctx;
  }

  // Native app token (iOS): acts as the user, like a browser session
  let userId: string;
  const appBearer = getAppBearer(request);
  if (appBearer) {
    const resolved = await resolveAppAccessToken(appBearer);
    if (!resolved) throw new AuthError("Session expired. Please sign in again.", 401);
    userId = resolved.userId;
  } else {
    // Session auth
    const session = await auth();
    if (!session?.user?.id) throw new AuthError("Not authenticated", 401);

    // Check if session was revoked (sign out all devices)
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { sessionRevokedAt: true },
    });
    if (user?.sessionRevokedAt) {
      // JWT iat is in seconds, sessionRevokedAt is a Date
      const tokenIat = (session as unknown as { iat?: number }).iat;
      if (tokenIat && tokenIat < Math.floor(user.sessionRevokedAt.getTime() / 1000)) {
        throw new AuthError("Session expired. Please sign in again.", 401);
      }
    }
    userId = session.user.id;
  }

  const orgId = organizationId || request.headers.get("x-organization-id");

  // If no org ID provided, auto-resolve if user has exactly one membership
  if (!orgId) {
    const memberships = await db.query.member.findMany({
      where: eq(member.userId, userId),
    });

    if (memberships.length === 0) {
      throw new AuthError("Not a member of any organization", 403);
    }
    if (memberships.length > 1) {
      throw new AuthError("Organization ID required when user belongs to multiple organizations", 400);
    }

    const customRoleInfo = await resolveCustomRole(memberships[0]);

    return {
      userId,
      organizationId: memberships[0].organizationId,
      role: memberships[0].role as MemberRole,
      ...customRoleInfo,
    };
  }

  const mem = await db.query.member.findFirst({
    where: and(
      eq(member.organizationId, orgId),
      eq(member.userId, userId)
    ),
  });

  if (!mem) {
    // Check advisor access as fallback
    const advisor = await db.query.advisorAccess.findFirst({
      where: and(
        eq(advisorAccess.advisorUserId, userId),
        eq(advisorAccess.organizationId, orgId),
        eq(advisorAccess.isActive, true)
      ),
    });

    if (!advisor || !advisor.acceptedAt) {
      throw new AuthError("Not a member of this organization", 403);
    }

    return {
      userId,
      organizationId: orgId,
      role: "member" as MemberRole,
      permissions: ADVISOR_PERMISSIONS,
      isAdvisor: true,
      advisorRole: advisor.role,
    };
  }

  const customRoleInfo = await resolveCustomRole(mem);

  return {
    userId,
    organizationId: orgId,
    role: mem.role as MemberRole,
    ...customRoleInfo,
  };
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

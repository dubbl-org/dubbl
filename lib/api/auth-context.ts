import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, apiKey, advisorAccess, customRole } from "@/lib/db/schema";
import { subscription } from "@/lib/db/schema/billing";
import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";
import { getEffectiveLimits, type MemberRole } from "@/lib/plans";

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
    const limits = getEffectiveLimits(sub ?? null);
    if (!limits.apiAccess) {
      throw new AuthError("API access requires a Pro or Business plan", 403);
    }

    // Update last used (fire and forget)
    db.update(apiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKey.id, key.id))
      .execute()
      .catch(() => {});

    // Get the member who created the key to resolve role
    const mem = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, key.organizationId),
        eq(member.userId, key.createdBy)
      ),
    });

    const customRoleInfo = mem ? await resolveCustomRole(mem) : {};

    return {
      userId: key.createdBy,
      organizationId: key.organizationId,
      role: (mem?.role ?? "member") as MemberRole,
      ...customRoleInfo,
    };
  }

  // Session auth
  const session = await auth();
  if (!session?.user?.id) throw new AuthError("Not authenticated", 401);

  const orgId = organizationId || request.headers.get("x-organization-id");

  // If no org ID provided, auto-resolve if user has exactly one membership
  if (!orgId) {
    const memberships = await db.query.member.findMany({
      where: eq(member.userId, session.user.id),
    });

    if (memberships.length === 0) {
      throw new AuthError("Not a member of any organization", 403);
    }
    if (memberships.length > 1) {
      throw new AuthError("Organization ID required when user belongs to multiple organizations", 400);
    }

    const customRoleInfo = await resolveCustomRole(memberships[0]);

    return {
      userId: session.user.id,
      organizationId: memberships[0].organizationId,
      role: memberships[0].role as MemberRole,
      ...customRoleInfo,
    };
  }

  const mem = await db.query.member.findFirst({
    where: and(
      eq(member.organizationId, orgId),
      eq(member.userId, session.user.id)
    ),
  });

  if (!mem) {
    // Check advisor access as fallback
    const advisor = await db.query.advisorAccess.findFirst({
      where: and(
        eq(advisorAccess.advisorUserId, session.user.id),
        eq(advisorAccess.organizationId, orgId),
        eq(advisorAccess.isActive, true)
      ),
    });

    if (!advisor || !advisor.acceptedAt) {
      throw new AuthError("Not a member of this organization", 403);
    }

    return {
      userId: session.user.id,
      organizationId: orgId,
      role: "member" as MemberRole,
      isAdvisor: true,
      advisorRole: advisor.role,
    };
  }

  const customRoleInfo = await resolveCustomRole(mem);

  return {
    userId: session.user.id,
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

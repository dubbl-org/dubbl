import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member, apiKey, advisorAccess } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";
import type { MemberRole } from "@/lib/plans";

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: MemberRole;
  isAdvisor?: boolean;
  advisorRole?: string;
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

    return {
      userId: key.createdBy,
      organizationId: key.organizationId,
      role: mem?.role ?? "member",
    };
  }

  // Session auth
  const session = await auth();
  if (!session?.user?.id) throw new AuthError("Not authenticated", 401);

  const orgId = organizationId || request.headers.get("x-organization-id");
  if (!orgId) throw new AuthError("Organization ID required", 400);

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

  return {
    userId: session.user.id,
    organizationId: orgId,
    role: mem.role as MemberRole,
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

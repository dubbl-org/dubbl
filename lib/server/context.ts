import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { member } from "@/lib/db/schema";
import { ACTIVE_ORG_COOKIE } from "@/lib/active-org";

export interface ServerContext {
  userId: string;
  organizationId: string;
  role: string;
}

/**
 * Auth context for server components.
 *
 * The API routes take their context from a request (session cookie or API key,
 * plus the x-organization-id header). A server component has no request object
 * to read, so it resolves the same information from the session cookie and the
 * active-org cookie, and validates membership exactly as the API does. Never
 * trust the cookie on its own — it is a hint about which org to load.
 */
export async function getServerContext(): Promise<ServerContext> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const cookieOrgId = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;

  // Existing sessions predate the cookie: it only appears once the client has
  // run. Falling back to the user's first membership matches what the client
  // loader does anyway (`organizations[0]`), and avoids bouncing every current
  // user to onboarding on the first request after deploy.
  const mem = cookieOrgId
    ? await db.query.member.findFirst({
        where: and(
          eq(member.organizationId, cookieOrgId),
          eq(member.userId, session.user.id)
        ),
      })
    : await db.query.member.findFirst({
        where: eq(member.userId, session.user.id),
        orderBy: asc(member.createdAt),
      });

  if (!mem) redirect("/onboarding");

  return {
    userId: session.user.id,
    organizationId: mem.organizationId,
    role: mem.role,
  };
}

/** Same, but returns null instead of redirecting — for optional data. */
export async function tryGetServerContext(): Promise<ServerContext | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const cookieOrgId = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const mem = cookieOrgId
    ? await db.query.member.findFirst({
        where: and(
          eq(member.organizationId, cookieOrgId),
          eq(member.userId, session.user.id)
        ),
      })
    : await db.query.member.findFirst({
        where: eq(member.userId, session.user.id),
        orderBy: asc(member.createdAt),
      });
  return mem
    ? { userId: session.user.id, organizationId: mem.organizationId, role: mem.role }
    : null;
}

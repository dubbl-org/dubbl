import { db } from "@/lib/db";
import { invitation, orgInviteLink } from "@/lib/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";

export { INVITE_COOKIE } from "@/lib/invite-token";

/**
 * Whether someone may register while registration is "invite only": they have
 * a pending, unexpired email invitation to their address, or they came from an
 * invite link (its token) that is still active, unexpired and under its use
 * limit.
 */
export async function hasRegistrationInvite(
  email: string,
  inviteToken?: string | null
): Promise<boolean> {
  const byEmail = await db.query.invitation.findFirst({
    where: and(
      sql`lower(${invitation.email}) = ${email.toLowerCase()}`,
      eq(invitation.status, "pending"),
      gt(invitation.expiresAt, new Date())
    ),
    columns: { id: true },
  });
  if (byEmail) return true;

  if (!inviteToken) return false;
  const link = await db.query.orgInviteLink.findFirst({
    where: eq(orgInviteLink.token, inviteToken),
  });
  if (!link || !link.isActive) return false;
  if (link.expiresAt && link.expiresAt < new Date()) return false;
  if (link.maxUses && link.useCount >= link.maxUses) return false;
  return true;
}

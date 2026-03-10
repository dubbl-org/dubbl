import { db } from "@/lib/db";
import { consolidationGroup, consolidationGroupMember, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, ok, created, error, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const addSchema = z.object({
  orgId: z.string().uuid("Invalid organization ID"),
  label: z.string().optional(),
});

const removeSchema = z.object({
  orgId: z.string().uuid("Invalid organization ID"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    // Verify the group belongs to this org
    const group = await db.query.consolidationGroup.findFirst({
      where: and(
        eq(consolidationGroup.id, id),
        eq(consolidationGroup.parentOrgId, ctx.organizationId),
        notDeleted(consolidationGroup.deletedAt)
      ),
    });

    if (!group) return notFound("Consolidation group");

    const body = await request.json();
    const parsed = addSchema.parse(body);

    // Verify the requesting user has access to the target org
    const membership = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, parsed.orgId),
        eq(member.userId, ctx.userId)
      ),
    });

    if (!membership) {
      return error("You do not have access to the specified organization", 403);
    }

    // Check if already a member
    const existing = await db.query.consolidationGroupMember.findFirst({
      where: and(
        eq(consolidationGroupMember.groupId, id),
        eq(consolidationGroupMember.orgId, parsed.orgId)
      ),
    });

    if (existing) {
      return error("Organization is already a member of this group", 409);
    }

    const [added] = await db
      .insert(consolidationGroupMember)
      .values({
        groupId: id,
        orgId: parsed.orgId,
        label: parsed.label || null,
      })
      .returning();

    return created({ member: added });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    // Verify the group belongs to this org
    const group = await db.query.consolidationGroup.findFirst({
      where: and(
        eq(consolidationGroup.id, id),
        eq(consolidationGroup.parentOrgId, ctx.organizationId),
        notDeleted(consolidationGroup.deletedAt)
      ),
    });

    if (!group) return notFound("Consolidation group");

    const body = await request.json();
    const parsed = removeSchema.parse(body);

    const existing = await db.query.consolidationGroupMember.findFirst({
      where: and(
        eq(consolidationGroupMember.groupId, id),
        eq(consolidationGroupMember.orgId, parsed.orgId)
      ),
    });

    if (!existing) {
      return notFound("Group member");
    }

    await db
      .delete(consolidationGroupMember)
      .where(eq(consolidationGroupMember.id, existing.id));

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

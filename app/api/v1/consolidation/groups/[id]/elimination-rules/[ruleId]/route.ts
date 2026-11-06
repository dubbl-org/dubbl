import { db } from "@/lib/db";
import { consolidationGroup, consolidationEliminationRule } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

/** Remove an elimination rule from a group (soft delete). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; ruleId: string }> }
) {
  try {
    const { id, ruleId } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:reports");

    const group = await db.query.consolidationGroup.findFirst({
      where: and(
        eq(consolidationGroup.id, id),
        eq(consolidationGroup.parentOrgId, ctx.organizationId),
        notDeleted(consolidationGroup.deletedAt)
      ),
    });
    if (!group) return notFound("Consolidation group");

    const rule = await db.query.consolidationEliminationRule.findFirst({
      where: and(
        eq(consolidationEliminationRule.id, ruleId),
        eq(consolidationEliminationRule.groupId, group.id),
        notDeleted(consolidationEliminationRule.deletedAt)
      ),
    });
    if (!rule) return notFound("Elimination rule");

    await db
      .update(consolidationEliminationRule)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(consolidationEliminationRule.id, rule.id));

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

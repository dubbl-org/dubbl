import { db } from "@/lib/db";
import { consolidationGroup, consolidationEliminationRule } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  kind: z.enum(["ar_ap", "sales_cogs", "investment_equity", "custom"]),
  debitAccountMatch: z.string().trim().max(20).nullable().optional(),
  creditAccountMatch: z.string().trim().max(20).nullable().optional(),
  description: z.string().nullable().optional(),
});

async function loadOwnedGroup(organizationId: string, groupId: string) {
  return db.query.consolidationGroup.findFirst({
    where: and(
      eq(consolidationGroup.id, groupId),
      eq(consolidationGroup.parentOrgId, organizationId),
      notDeleted(consolidationGroup.deletedAt)
    ),
  });
}

/** List a group's intercompany elimination rules (account-code prefixes to net out). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const group = await loadOwnedGroup(ctx.organizationId, id);
    if (!group) return notFound("Consolidation group");

    const rules = await db.query.consolidationEliminationRule.findMany({
      where: and(
        eq(consolidationEliminationRule.groupId, group.id),
        notDeleted(consolidationEliminationRule.deletedAt)
      ),
      orderBy: (r, { asc }) => [asc(r.createdAt)],
    });
    return ok({ rules });
  } catch (err) {
    return handleError(err);
  }
}

/** Add an elimination rule to a group. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:reports");
    const group = await loadOwnedGroup(ctx.organizationId, id);
    if (!group) return notFound("Consolidation group");

    const parsed = createSchema.parse(await request.json());
    const [rule] = await db
      .insert(consolidationEliminationRule)
      .values({
        groupId: group.id,
        name: parsed.name,
        kind: parsed.kind,
        debitAccountMatch: parsed.debitAccountMatch || null,
        creditAccountMatch: parsed.creditAccountMatch || null,
        description: parsed.description || null,
      })
      .returning();
    return created({ rule });
  } catch (err) {
    return handleError(err);
  }
}

import { db } from "@/lib/db";
import { taxBracket } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  jurisdictionLevel: z.enum(["federal", "state", "local"]).optional(),
  jurisdiction: z.string().nullable().optional(),
  minIncome: z.number().int().optional(),
  maxIncome: z.number().int().nullable().optional(),
  rate: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:tax-config");

    const bracket = await db.query.taxBracket.findFirst({
      where: and(
        eq(taxBracket.id, id),
        eq(taxBracket.organizationId, ctx.organizationId),
        notDeleted(taxBracket.deletedAt)
      ),
    });

    if (!bracket) return notFound("Tax bracket");
    return ok({ bracket });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:tax-config");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(taxBracket)
      .set(parsed)
      .where(and(
        eq(taxBracket.id, id),
        eq(taxBracket.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!updated) return notFound("Tax bracket");

    logAudit({ ctx, action: "update", entityType: "taxBracket", entityId: id, changes: parsed, request });

    return ok({ bracket: updated });
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
    requireRole(ctx, "manage:tax-config");

    const [deleted] = await db
      .update(taxBracket)
      .set(softDelete())
      .where(and(
        eq(taxBracket.id, id),
        eq(taxBracket.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!deleted) return notFound("Tax bracket");

    logAudit({ ctx, action: "delete", entityType: "taxBracket", entityId: id, request });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

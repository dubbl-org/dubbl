import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankRule } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  priority: z.number().int().optional(),
  matchField: z.string().optional(),
  matchType: z.enum(["contains", "equals", "starts_with", "ends_with"]).optional(),
  matchValue: z.string().min(1).optional(),
  accountId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
  autoReconcile: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const found = await db.query.bankRule.findFirst({
      where: and(
        eq(bankRule.id, id),
        eq(bankRule.organizationId, ctx.organizationId),
        notDeleted(bankRule.deletedAt)
      ),
    });

    if (!found) return notFound("Bank rule");
    return NextResponse.json({ bankRule: found });
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
    requireRole(ctx, "manage:bank-rules");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.bankRule.findFirst({
      where: and(
        eq(bankRule.id, id),
        eq(bankRule.organizationId, ctx.organizationId),
        notDeleted(bankRule.deletedAt)
      ),
    });

    if (!existing) return notFound("Bank rule");

    const [updated] = await db
      .update(bankRule)
      .set(parsed)
      .where(eq(bankRule.id, id))
      .returning();

    return NextResponse.json({ bankRule: updated });
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
    requireRole(ctx, "manage:bank-rules");

    const existing = await db.query.bankRule.findFirst({
      where: and(
        eq(bankRule.id, id),
        eq(bankRule.organizationId, ctx.organizationId),
        notDeleted(bankRule.deletedAt)
      ),
    });

    if (!existing) return notFound("Bank rule");

    await db
      .update(bankRule)
      .set(softDelete())
      .where(eq(bankRule.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

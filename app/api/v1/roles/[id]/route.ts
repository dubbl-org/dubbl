import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customRole, member } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound, error } from "@/lib/api/response";
import { ALL_PERMISSIONS } from "@/lib/plans";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  permissions: z.array(z.string().refine((p) => ALL_PERMISSIONS.includes(p), {
    message: "Invalid permission",
  })).min(1).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;

    const role = await db.query.customRole.findFirst({
      where: and(
        eq(customRole.id, id),
        eq(customRole.organizationId, ctx.organizationId)
      ),
    });

    if (!role) return notFound("Role");

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(member)
      .where(
        and(
          eq(member.organizationId, ctx.organizationId),
          eq(member.customRoleId, id)
        )
      );

    return NextResponse.json({ role: { ...role, memberCount: result?.count ?? 0 } });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "change:roles");
    const { id } = await params;

    const existing = await db.query.customRole.findFirst({
      where: and(
        eq(customRole.id, id),
        eq(customRole.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) return notFound("Role");
    if (existing.isSystem) return error("Cannot modify system roles", 400);

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(customRole)
      .set({
        ...(parsed.name !== undefined && { name: parsed.name }),
        ...(parsed.description !== undefined && { description: parsed.description }),
        ...(parsed.permissions !== undefined && { permissions: parsed.permissions }),
        updatedAt: new Date(),
      })
      .where(eq(customRole.id, id))
      .returning();

    return NextResponse.json({ role: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "change:roles");
    const { id } = await params;

    const existing = await db.query.customRole.findFirst({
      where: and(
        eq(customRole.id, id),
        eq(customRole.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) return notFound("Role");
    if (existing.isSystem) return error("Cannot delete system roles", 400);

    // Check if any members are assigned this role
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(member)
      .where(
        and(
          eq(member.organizationId, ctx.organizationId),
          eq(member.customRoleId, id)
        )
      );

    if ((result?.count ?? 0) > 0) {
      return error("Cannot delete role while members are assigned to it. Reassign members first.", 400);
    }

    await db.delete(customRole).where(eq(customRole.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

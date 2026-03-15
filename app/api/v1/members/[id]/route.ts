import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { z } from "zod";
import { logAudit, diffChanges } from "@/lib/api/audit";

const updateSchema = z.object({
  role: z.enum(["admin", "member"]).optional(),
  customRoleId: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "change:roles");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const target = await db.query.member.findFirst({
      where: and(
        eq(member.id, id),
        eq(member.organizationId, ctx.organizationId)
      ),
    });

    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if (target.role === "owner") {
      return NextResponse.json(
        { error: "Cannot change the owner's role" },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.role !== undefined) updates.role = parsed.role;
    if (parsed.customRoleId !== undefined) updates.customRoleId = parsed.customRoleId;

    const [updated] = await db
      .update(member)
      .set(updates)
      .where(eq(member.id, id))
      .returning();

    logAudit({ ctx, action: "update", entityType: "member", entityId: id, changes: diffChanges(target as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json({ member: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "remove:members");

    const target = await db.query.member.findFirst({
      where: and(
        eq(member.id, id),
        eq(member.organizationId, ctx.organizationId)
      ),
    });

    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if (target.role === "owner") {
      return NextResponse.json(
        { error: "Cannot remove the organization owner" },
        { status: 400 }
      );
    }

    await db.delete(member).where(eq(member.id, id));

    logAudit({ ctx, action: "delete", entityType: "member", entityId: id, request });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

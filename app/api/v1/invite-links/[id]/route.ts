import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orgInviteLink } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";

// PATCH - toggle active, update settings
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "invite:members");
    const { id } = await params;

    const link = await db.query.orgInviteLink.findFirst({
      where: and(
        eq(orgInviteLink.id, id),
        eq(orgInviteLink.organizationId, ctx.organizationId)
      ),
    });
    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.isActive === "boolean") updates.isActive = body.isActive;
    if (typeof body.defaultRole === "string") updates.defaultRole = body.defaultRole;

    await db.update(orgInviteLink).set(updates).where(eq(orgInviteLink.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE - remove an invite link
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "invite:members");
    const { id } = await params;

    const link = await db.query.orgInviteLink.findFirst({
      where: and(
        eq(orgInviteLink.id, id),
        eq(orgInviteLink.organizationId, ctx.organizationId)
      ),
    });
    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    await db.delete(orgInviteLink).where(eq(orgInviteLink.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

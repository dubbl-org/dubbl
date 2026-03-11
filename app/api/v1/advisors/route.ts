import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { advisorAccess } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const advisors = await db.query.advisorAccess.findMany({
      where: eq(advisorAccess.organizationId, ctx.organizationId),
      with: {
        advisorUser: true,
        grantedByUser: true,
      },
    });

    return NextResponse.json({
      advisors: advisors.map((a) => ({
        id: a.id,
        role: a.role,
        isActive: a.isActive,
        inviteEmail: a.inviteEmail,
        invitedAt: a.invitedAt,
        acceptedAt: a.acceptedAt,
        revokedAt: a.revokedAt,
        advisor: a.advisorUser
          ? { id: a.advisorUser.id, name: a.advisorUser.name, email: a.advisorUser.email }
          : null,
        grantedBy: a.grantedByUser
          ? { id: a.grantedByUser.id, name: a.grantedByUser.name }
          : null,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:members");

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await db.query.advisorAccess.findFirst({
      where: and(
        eq(advisorAccess.id, id),
        eq(advisorAccess.organizationId, ctx.organizationId)
      ),
    });

    if (!existing) return notFound("Advisor access");

    await db
      .update(advisorAccess)
      .set({ isActive: false, revokedAt: new Date() })
      .where(eq(advisorAccess.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

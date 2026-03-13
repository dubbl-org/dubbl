import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invitation } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";

// Revoke a pending invitation
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "invite:members");
    const { id } = await params;

    const inv = await db.query.invitation.findFirst({
      where: and(
        eq(invitation.id, id),
        eq(invitation.organizationId, ctx.organizationId)
      ),
    });

    if (!inv) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    if (inv.status !== "pending") {
      return NextResponse.json({ error: "Can only revoke pending invitations" }, { status: 400 });
    }

    await db
      .update(invitation)
      .set({ status: "revoked" })
      .where(eq(invitation.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

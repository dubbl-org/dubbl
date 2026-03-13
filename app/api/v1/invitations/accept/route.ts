import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invitation, member, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";

const acceptSchema = z.object({
  token: z.string().min(1),
});

// Accept an invitation (requires authenticated user)
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { token } = acceptSchema.parse(body);

    const inv = await db.query.invitation.findFirst({
      where: eq(invitation.token, token),
      with: { organization: true },
    });

    if (!inv) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    if (inv.status !== "pending") {
      return NextResponse.json({ error: `This invitation has been ${inv.status}` }, { status: 400 });
    }

    if (new Date() > inv.expiresAt) {
      await db.update(invitation).set({ status: "expired" }).where(eq(invitation.id, inv.id));
      return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
    }

    // Check the user's email matches the invitation
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });
    if (!user || user.email !== inv.email) {
      return NextResponse.json(
        { error: `This invitation was sent to ${inv.email}. Please sign in with that email.` },
        { status: 403 }
      );
    }

    // Check not already a member
    const existingMember = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, inv.organizationId),
        eq(member.userId, session.user.id)
      ),
    });
    if (existingMember) {
      await db.update(invitation).set({ status: "accepted", acceptedAt: new Date(), acceptedByUserId: session.user.id }).where(eq(invitation.id, inv.id));
      return NextResponse.json({ organizationId: inv.organizationId, orgName: inv.organization?.name, alreadyMember: true });
    }

    // Add as member and mark invitation accepted
    await db.insert(member).values({
      organizationId: inv.organizationId,
      userId: session.user.id,
      role: inv.role as "admin" | "member",
    });

    await db
      .update(invitation)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
        acceptedByUserId: session.user.id,
      })
      .where(eq(invitation.id, inv.id));

    return NextResponse.json({
      organizationId: inv.organizationId,
      orgName: inv.organization?.name,
      alreadyMember: false,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

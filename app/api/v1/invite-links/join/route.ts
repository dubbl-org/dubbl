import { NextResponse } from "next/server";
import { memberCapacity } from "@/lib/api/check-limit";
import { db } from "@/lib/db";
import { orgInviteLink, member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { z } from "zod";

const joinSchema = z.object({
  token: z.string().min(1),
});

// Join an org via invite link (requires authenticated user)
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { token } = joinSchema.parse(body);

    const link = await db.query.orgInviteLink.findFirst({
      where: eq(orgInviteLink.token, token),
      with: { organization: true },
    });

    if (!link) {
      return NextResponse.json({ error: "Invite link not found" }, { status: 404 });
    }

    if (!link.isActive) {
      return NextResponse.json({ error: "This invite link has been disabled" }, { status: 400 });
    }

    if (link.expiresAt && new Date() > link.expiresAt) {
      return NextResponse.json({ error: "This invite link has expired" }, { status: 410 });
    }

    if (link.maxUses && link.useCount >= link.maxUses) {
      return NextResponse.json({ error: "This invite link has reached its maximum uses" }, { status: 400 });
    }

    // Check not already a member
    const existingMember = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, link.organizationId),
        eq(member.userId, session.user.id)
      ),
    });
    if (existingMember) {
      return NextResponse.json({
        organizationId: link.organizationId,
        orgName: link.organization?.name,
        alreadyMember: true,
      });
    }

    // Check member capacity
    const capacity = await memberCapacity(link.organizationId);
    if (!capacity.canAdd) {
      return NextResponse.json(
        { error: "This organization can't add more members on its current plan. Ask an admin to upgrade." },
        { status: 403 }
      );
    }

    // Add as member
    await db.insert(member).values({
      organizationId: link.organizationId,
      userId: session.user.id,
      role: link.defaultRole as "admin" | "member",
    });

    // Increment use count
    await db
      .update(orgInviteLink)
      .set({ useCount: link.useCount + 1 })
      .where(eq(orgInviteLink.id, link.id));

    return NextResponse.json({
      organizationId: link.organizationId,
      orgName: link.organization?.name,
      alreadyMember: false,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

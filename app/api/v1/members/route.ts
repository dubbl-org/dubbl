import { NextResponse } from "next/server";
import { memberCapacity } from "@/lib/api/check-limit";
import { db } from "@/lib/db";
import { member, users, organization } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { z } from "zod";
import { render } from "@react-email/render";
import { createElement } from "react";
import { MemberInviteEmail } from "@/lib/email/templates/member-invite";
import { sendPlatformEmail } from "@/lib/email/resend-client";
import { toAppUrl } from "@/lib/public-url";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const members = await db.query.member.findMany({
      where: eq(member.organizationId, ctx.organizationId),
      with: {
        user: { columns: { id: true, name: true, email: true, image: true } },
        customRole: true,
        teamMemberships: { with: { team: { columns: { id: true, name: true, color: true } } } },
      },
    });

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        userName: m.user?.name || null,
        userEmail: m.user?.email || "",
        role: m.role,
        customRoleId: m.customRoleId || null,
        customRoleName: m.customRole?.name || null,
        teams: m.teamMemberships.map((tm) => tm.team),
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "invite:members");

    const body = await request.json();
    const parsed = inviteSchema.parse(body);

    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, parsed.email),
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found. They must sign up first." },
        { status: 404 }
      );
    }

    // Check not already a member
    const existing = await db.query.member.findFirst({
      where: and(
        eq(member.organizationId, ctx.organizationId),
        eq(member.userId, user.id)
      ),
    });
    if (existing) {
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 409 }
      );
    }

    // Enforce billing status
    const capacity = await memberCapacity(ctx.organizationId);
    if (!capacity.billingOk) {
      return NextResponse.json({ error: capacity.reason }, { status: 402 });
    }
    if (!capacity.canAdd) {
      return NextResponse.json({ error: capacity.reason }, { status: 403 });
    }

    const [newMember] = await db
      .insert(member)
      .values({
        organizationId: ctx.organizationId,
        userId: user.id,
        role: parsed.role,
      })
      .returning();

    // Send invite email (fire and forget)
    const inviter = await db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
    });
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });
    if (inviter && org) {
      render(createElement(MemberInviteEmail, {
        inviterName: inviter.name || "A team member",
        orgName: org.name,
        role: parsed.role,
        loginUrl: toAppUrl("/sign-in"),
      }))
        .then((html) => sendPlatformEmail({ to: user.email, subject: `You've been invited to ${org.name}`, html }))
        .catch(() => {});
    }

    return NextResponse.json(
      {
        member: {
          ...newMember,
          userName: user.name,
          userEmail: user.email,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { member, users, organization } from "@/lib/db/schema";
import { subscription } from "@/lib/db/schema/billing";
import { eq, and, count } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { getEffectiveLimits } from "@/lib/plans";
import { z } from "zod";
import { render } from "@react-email/render";
import { createElement } from "react";
import { MemberInviteEmail } from "@/lib/email/templates/member-invite";
import { sendPlatformEmail } from "@/lib/email/resend-client";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const members = await db.query.member.findMany({
      where: eq(member.organizationId, ctx.organizationId),
      with: { user: true, customRole: true },
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
    const sub = await db.query.subscription.findFirst({
      where: eq(subscription.organizationId, ctx.organizationId),
    });
    const billingStatus = sub?.status ?? "active";
    if (billingStatus === "past_due" || billingStatus === "incomplete") {
      return NextResponse.json(
        { error: "Your billing is past due. Update your payment method to invite members." },
        { status: 402 }
      );
    }

    // Enforce member limit
    const [memberCountResult] = await db
      .select({ count: count() })
      .from(member)
      .where(eq(member.organizationId, ctx.organizationId));
    const limits = getEffectiveLimits(sub ?? null);
    if (memberCountResult.count >= limits.members) {
      const plan = sub?.plan ?? "free";
      if (plan === "free") {
        return NextResponse.json(
          { error: "Free plan is limited to 1 member. Upgrade to Pro to invite your team." },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: `You've reached your plan's limit of ${limits.members} members. Upgrade your plan or contact support.` },
        { status: 403 }
      );
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
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.dubbl.dev";
      render(createElement(MemberInviteEmail, {
        inviterName: inviter.name || "A team member",
        orgName: org.name,
        role: parsed.role,
        loginUrl: `${appUrl}/sign-in`,
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

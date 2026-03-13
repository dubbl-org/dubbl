import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invitation, member, users, organization } from "@/lib/db/schema";
import { subscription } from "@/lib/db/schema/billing";
import { eq, and, count } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { getEffectiveLimits } from "@/lib/plans";
import { z } from "zod";
import { randomBytes } from "crypto";
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

    const invitations = await db.query.invitation.findMany({
      where: eq(invitation.organizationId, ctx.organizationId),
      with: { invitedBy: true },
      orderBy: (inv, { desc }) => [desc(inv.createdAt)],
    });

    return NextResponse.json({
      invitations: invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        invitedByName: inv.invitedBy?.name || inv.invitedBy?.email || "Unknown",
        expiresAt: inv.expiresAt.toISOString(),
        acceptedAt: inv.acceptedAt?.toISOString() || null,
        createdAt: inv.createdAt.toISOString(),
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

    // Check billing status
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

    // Enforce member limit (count current members + pending invitations)
    const [memberCountResult] = await db
      .select({ count: count() })
      .from(member)
      .where(eq(member.organizationId, ctx.organizationId));

    const [pendingCount] = await db
      .select({ count: count() })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, ctx.organizationId),
          eq(invitation.status, "pending")
        )
      );

    const totalUsed = memberCountResult.count + pendingCount.count;
    const limits = getEffectiveLimits(sub ?? null);
    const plan = sub?.plan ?? "free";
    const seatCount = sub?.seatCount ?? 1;

    let memberMax: number;
    if (sub?.overrideMembers != null) {
      memberMax = sub.overrideMembers;
    } else if (plan === "pro") {
      memberMax = seatCount;
    } else {
      memberMax = limits.members;
    }

    if (totalUsed >= memberMax) {
      if (plan === "free") {
        return NextResponse.json(
          { error: "Free plan is limited to 1 member. Upgrade to Pro to invite your team." },
          { status: 403 }
        );
      }
      if (plan === "pro") {
        return NextResponse.json(
          { error: `You've used all ${seatCount} seats. Add more seats in billing settings.` },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: `You've reached your limit of ${memberMax} members.` },
        { status: 403 }
      );
    }

    // Check if already a member
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, parsed.email),
    });
    if (existingUser) {
      const existingMember = await db.query.member.findFirst({
        where: and(
          eq(member.organizationId, ctx.organizationId),
          eq(member.userId, existingUser.id)
        ),
      });
      if (existingMember) {
        return NextResponse.json({ error: "User is already a member" }, { status: 409 });
      }
    }

    // Check if already has a pending invitation
    const existingInvite = await db.query.invitation.findFirst({
      where: and(
        eq(invitation.organizationId, ctx.organizationId),
        eq(invitation.email, parsed.email),
        eq(invitation.status, "pending")
      ),
    });
    if (existingInvite) {
      return NextResponse.json({ error: "An invitation is already pending for this email" }, { status: 409 });
    }

    // Create invitation
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [inv] = await db
      .insert(invitation)
      .values({
        organizationId: ctx.organizationId,
        email: parsed.email,
        role: parsed.role,
        token,
        invitedById: ctx.userId,
        expiresAt,
      })
      .returning();

    // Send invite email
    const inviter = await db.query.users.findFirst({
      where: eq(users.id, ctx.userId),
    });
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });
    if (inviter && org) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dubbl.dev";
      const acceptUrl = `${appUrl}/invite/${token}`;
      render(
        createElement(MemberInviteEmail, {
          inviterName: inviter.name || "A team member",
          orgName: org.name,
          role: parsed.role,
          loginUrl: acceptUrl,
        })
      )
        .then((html) =>
          sendPlatformEmail({
            to: parsed.email,
            subject: `You've been invited to ${org.name} on dubbl`,
            html,
          })
        )
        .catch(() => {});
    }

    return NextResponse.json(
      {
        invitation: {
          id: inv.id,
          email: inv.email,
          role: inv.role,
          status: inv.status,
          expiresAt: inv.expiresAt.toISOString(),
          createdAt: inv.createdAt.toISOString(),
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

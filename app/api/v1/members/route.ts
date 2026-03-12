import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { member, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { z } from "zod";

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

    const [newMember] = await db
      .insert(member)
      .values({
        organizationId: ctx.organizationId,
        userId: user.id,
        role: parsed.role,
      })
      .returning();

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

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, organization, member, subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { render } from "@react-email/render";
import { createElement } from "react";
import { WelcomeEmail } from "@/lib/email/templates/welcome";
import { OrgCreatedEmail } from "@/lib/email/templates/org-created";
import { sendPlatformEmail } from "@/lib/email/resend-client";

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.parse(body);

    // Check if email exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, parsed.email),
    });
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(parsed.password, 12);

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        name: parsed.name,
        email: parsed.email,
        passwordHash,
      })
      .returning();

    // Create default organization
    const slug = parsed.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const [org] = await db
      .insert(organization)
      .values({
        name: `${parsed.name}'s Org`,
        slug: `${slug}-${Date.now().toString(36)}`,
      })
      .returning();

    // Add user as owner
    await db.insert(member).values({
      organizationId: org.id,
      userId: user.id,
      role: "owner",
    });

    // Create free subscription
    await db.insert(subscription).values({
      organizationId: org.id,
      plan: "free",
      status: "active",
    });

    // Send welcome and org-created emails (fire and forget)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.dubbl.dev";

    render(createElement(WelcomeEmail, { userName: parsed.name, loginUrl: `${appUrl}/sign-in` }))
      .then((html) => sendPlatformEmail({ to: parsed.email, subject: "Welcome to dubbl", html }))
      .catch(() => {});

    render(createElement(OrgCreatedEmail, { userName: parsed.name, orgName: org.name, dashboardUrl: `${appUrl}/dashboard` }))
      .then((html) => sendPlatformEmail({ to: parsed.email, subject: `${org.name} is ready`, html }))
      .catch(() => {});

    return NextResponse.json(
      { user: { id: user.id, name: user.name, email: user.email } },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    console.error("Registration error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

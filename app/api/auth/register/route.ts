import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, organization, member, subscription } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { render } from "@react-email/render";
import { createElement } from "react";
import { WelcomeEmail } from "@/lib/email/templates/welcome";
import { OrgCreatedEmail } from "@/lib/email/templates/org-created";
import { sendPlatformEmail } from "@/lib/email/resend-client";
import { getSiteSetting, isSelfHostedUnlimited } from "@/lib/site-settings";
import { verifyTurnstile } from "@/lib/auth/turnstile";

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  turnstileToken: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.parse(body);

    // Verify Turnstile captcha
    if (parsed.turnstileToken) {
      const valid = await verifyTurnstile(parsed.turnstileToken);
      if (!valid) {
        return NextResponse.json(
          { error: "Captcha verification failed" },
          { status: 400 }
        );
      }
    } else if (process.env.TURNSTILE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Captcha token required" },
        { status: 400 }
      );
    }

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

    // Check if this is the first user
    const [{ count: userCount }] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(users);
    const isFirstUser = userCount === 0;

    if (!isFirstUser) {
      // Check registration mode
      const registrationMode = await getSiteSetting("registration_mode");
      if (registrationMode === "disabled") {
        return NextResponse.json(
          { error: "Registration is currently disabled" },
          { status: 403 }
        );
      }
      if (registrationMode === "invite_only") {
        // TODO: check invitation table for pending invite
        return NextResponse.json(
          { error: "Registration is by invitation only" },
          { status: 403 }
        );
      }

      // Check domain restriction
      const allowedDomains = await getSiteSetting("allowed_email_domains");
      if (allowedDomains) {
        const domains = allowedDomains.split(",").map((d) => d.trim().toLowerCase());
        const emailDomain = parsed.email.split("@")[1]?.toLowerCase();
        if (!emailDomain || !domains.includes(emailDomain)) {
          return NextResponse.json(
            { error: "Registration is not allowed for this email domain" },
            { status: 403 }
          );
        }
      }
    }

    const passwordHash = await bcrypt.hash(parsed.password, 12);

    // Create user (first user becomes site admin)
    const [user] = await db
      .insert(users)
      .values({
        name: parsed.name,
        email: parsed.email,
        passwordHash,
        ...(isFirstUser ? { isSiteAdmin: true } : {}),
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

    // Create subscription (pro for self-hosted, free otherwise)
    const selfHosted = isSelfHostedUnlimited();
    await db.insert(subscription).values({
      organizationId: org.id,
      plan: selfHosted ? "pro" : "free",
      status: "active",
      ...(selfHosted ? { managedBy: "manual" } : {}),
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

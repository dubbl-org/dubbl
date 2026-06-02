import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { render } from "@react-email/render";
import { createElement } from "react";
import { WelcomeEmail } from "@/lib/email/templates/welcome";
import { sendPlatformEmail } from "@/lib/email/resend-client";
import { getSiteSetting } from "@/lib/site-settings";
import { toAppUrl } from "@/lib/public-url";

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

    // Send welcome email (fire and forget)
    render(createElement(WelcomeEmail, { userName: parsed.name, loginUrl: toAppUrl("/sign-in") }))
      .then((html) => sendPlatformEmail({ to: parsed.email, subject: "Welcome to dubbl", html }))
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

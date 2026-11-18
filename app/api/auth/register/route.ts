import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, invitation, orgInviteLink } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { render } from "@react-email/render";
import { createElement } from "react";
import { WelcomeEmail } from "@/lib/email/templates/welcome";
import { sendPlatformEmail } from "@/lib/email/resend-client";
import { rateLimit, clientIp } from "@/lib/api/rate-limit";

// Constant-work target for the existing-email path so response timing does not
// distinguish registered from unregistered addresses. Bcrypt hash of random data.
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7Ff7UiLzQSKiF4TnCBmCY0YCAa5YQ9S";
import { getSiteSetting } from "@/lib/site-settings";
import { toAppUrl } from "@/lib/public-url";

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  // Present when signing up through an invite link or email invitation.
  inviteToken: z.string().min(16).max(128).optional(),
});

/**
 * A valid invite lets the bearer register even when open registration is
 * locked: an admin explicitly shared the link / sent the invitation.
 * Link tokens are 32 hex chars, email invitation tokens 64.
 */
async function isValidInvite(token: string, email: string): Promise<boolean> {
  const now = new Date();
  if (token.length === 32) {
    const link = await db.query.orgInviteLink.findFirst({
      where: eq(orgInviteLink.token, token),
    });
    return (
      !!link &&
      link.isActive &&
      (!link.expiresAt || link.expiresAt > now) &&
      (!link.maxUses || link.useCount < link.maxUses)
    );
  }
  const inv = await db.query.invitation.findFirst({
    where: eq(invitation.token, token),
  });
  return (
    !!inv &&
    inv.status === "pending" &&
    inv.email.toLowerCase() === email.toLowerCase() &&
    inv.expiresAt > now
  );
}

export async function POST(request: Request) {
  try {
    if (!rateLimit(`register:${clientIp(request)}`, 10)) {
      return NextResponse.json({ error: "Too many attempts, try again later" }, { status: 429 });
    }

    const body = await request.json();
    const parsed = registerSchema.parse(body);

    // Check if email exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, parsed.email),
    });
    if (existing) {
      // Equalize timing with the success path (which bcrypt-hashes) so this
      // endpoint cannot be used to enumerate registered emails.
      await bcrypt.compare(parsed.password, DUMMY_HASH);
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
      const inviteOk = parsed.inviteToken
        ? await isValidInvite(parsed.inviteToken, parsed.email)
        : false;

      if (!inviteOk) {
        // Check registration mode
        const registrationMode = await getSiteSetting("registration_mode");
        if (registrationMode === "disabled") {
          return NextResponse.json(
            { error: "Registration is currently disabled" },
            { status: 403 }
          );
        }
        if (registrationMode === "invite_only") {
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

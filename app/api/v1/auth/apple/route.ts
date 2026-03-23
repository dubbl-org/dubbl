import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, accounts, organization, member, subscription } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { createMobileToken } from "@/lib/auth/mobile-token";
import { trackLogin } from "@/lib/auth/track-login";
import { getSiteSetting, isSelfHostedUnlimited } from "@/lib/site-settings";
import { jwtVerify, createRemoteJWKSet } from "jose";

const appleJWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys")
);

const schema = z.object({
  idToken: z.string(),
  name: z.string().optional(),
  email: z.string().email().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.parse(body);

    // Verify the Apple identity token
    const { payload } = await jwtVerify(parsed.idToken, appleJWKS, {
      issuer: "https://appleid.apple.com",
      audience: process.env.AUTH_APPLE_ID,
    });

    const appleUserId = payload.sub;
    const appleEmail = (payload.email as string) || parsed.email;

    if (!appleUserId || !appleEmail) {
      return NextResponse.json({ error: "Invalid Apple token" }, { status: 400 });
    }

    // Check if we have a linked Apple account
    const existingAccount = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.provider, "apple"),
        eq(accounts.providerAccountId, appleUserId)
      ),
    });

    let user;

    if (existingAccount) {
      // Existing Apple account - find the user
      user = await db.query.users.findFirst({
        where: eq(users.id, existingAccount.userId),
      });
    } else {
      // New Apple sign-in - find by email or create
      user = await db.query.users.findFirst({
        where: eq(users.email, appleEmail),
      });

      if (!user) {
        // Check registration restrictions
        const [{ count: userCount }] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(users);
        const isFirstUser = userCount === 0;

        if (!isFirstUser) {
          const registrationMode = await getSiteSetting("registration_mode");
          if (registrationMode === "disabled") {
            return NextResponse.json({ error: "Registration is currently disabled" }, { status: 403 });
          }
          if (registrationMode === "invite_only") {
            return NextResponse.json({ error: "Registration is by invitation only" }, { status: 403 });
          }

          const allowedDomains = await getSiteSetting("allowed_email_domains");
          if (allowedDomains) {
            const domains = allowedDomains.split(",").map((d) => d.trim().toLowerCase());
            const emailDomain = appleEmail.split("@")[1]?.toLowerCase();
            if (!emailDomain || !domains.includes(emailDomain)) {
              return NextResponse.json({ error: "Registration is not allowed for this email domain" }, { status: 403 });
            }
          }
        }

        // Create user
        const userName = parsed.name || appleEmail.split("@")[0];
        const [newUser] = await db
          .insert(users)
          .values({
            name: userName,
            email: appleEmail,
            ...(isFirstUser ? { isSiteAdmin: true } : {}),
          })
          .returning();
        user = newUser;

        // Create default org
        const slug = userName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const [org] = await db
          .insert(organization)
          .values({ name: `${userName}'s Org`, slug: `${slug}-${Date.now().toString(36)}` })
          .returning();

        await db.insert(member).values({ organizationId: org.id, userId: user.id, role: "owner" });

        const selfHosted = isSelfHostedUnlimited();
        await db.insert(subscription).values({
          organizationId: org.id,
          plan: selfHosted ? "pro" : "free",
          status: "active",
          ...(selfHosted ? { managedBy: "manual" } : {}),
        });
      }

      // Link Apple account
      await db.insert(accounts).values({
        userId: user.id,
        type: "oauth",
        provider: "apple",
        providerAccountId: appleUserId,
      });
    }

    if (!user) {
      return NextResponse.json({ error: "Failed to authenticate" }, { status: 500 });
    }

    const token = await createMobileToken(user);

    // Track login
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip") || "unknown";
    trackLogin({
      userId: user.id,
      ipAddress: ip,
      userAgent: request.headers.get("user-agent"),
      provider: "apple",
    });

    return NextResponse.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, image: user.image },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("v1/auth/apple error:", err);
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
}

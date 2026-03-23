import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createMobileToken } from "@/lib/auth/mobile-token";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { trackLogin } from "@/lib/auth/track-login";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  turnstileToken: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.parse(body);

    // Verify Turnstile if configured
    if (parsed.turnstileToken) {
      const valid = await verifyTurnstile(parsed.turnstileToken);
      if (!valid) {
        return NextResponse.json({ error: "Captcha verification failed" }, { status: 400 });
      }
    } else if (process.env.TURNSTILE_SECRET_KEY) {
      return NextResponse.json({ error: "Captcha token required" }, { status: 400 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, parsed.email),
    });

    if (!user?.passwordHash) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await bcrypt.compare(parsed.password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = await createMobileToken(user);

    // Track login (fire and forget)
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip") || "unknown";
    trackLogin({
      userId: user.id,
      ipAddress: ip,
      userAgent: request.headers.get("user-agent"),
      provider: "credentials",
    });

    return NextResponse.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, image: user.image },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("v1/auth/sign-in error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

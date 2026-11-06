import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appAuthCode } from "@/lib/db/schema";
import { APP_PLATFORMS, APP_REDIRECT_URIS, hashToken } from "@/lib/api/app-auth";

const approveSchema = z.object({
  redirect_uri: z.string(),
  code_challenge: z.string().min(43).max(128),
  state: z.string().min(1),
  platform: z.enum(APP_PLATFORMS),
  device_name: z.string().max(120).optional(),
});

/**
 * Called by /app-authorize when the signed-in user approves a native app.
 * Returns the redirect back into the app carrying a one-time code.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const parsed = approveSchema.parse(await request.json());
    if (!APP_REDIRECT_URIS.includes(parsed.redirect_uri)) {
      return NextResponse.json({ error: "Invalid redirect_uri" }, { status: 400 });
    }

    const code = randomBytes(32).toString("hex");
    await db.insert(appAuthCode).values({
      codeHash: hashToken(code),
      userId: session.user.id,
      platform: parsed.platform,
      deviceName: parsed.device_name ?? null,
      redirectUri: parsed.redirect_uri,
      codeChallenge: parsed.code_challenge,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    const params = new URLSearchParams({ code, state: parsed.state });
    return NextResponse.json({ redirect_url: `${parsed.redirect_uri}?${params.toString()}` });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    console.error("App authorize error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

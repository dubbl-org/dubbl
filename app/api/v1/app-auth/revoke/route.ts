import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appSession } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAppBearer, hashToken } from "@/lib/api/app-auth";

/**
 * Sign a native app out: ends the session behind the bearer access token or the
 * `refresh_token` in the body. Always succeeds so a stale token can't block sign-out.
 */
export async function POST(request: Request) {
  const bearer = getAppBearer(request);
  const body = (await request.json().catch(() => ({}))) as { refresh_token?: unknown };

  if (bearer) {
    await db.delete(appSession).where(eq(appSession.accessTokenHash, hashToken(bearer)));
  }
  if (typeof body.refresh_token === "string" && body.refresh_token) {
    await db.delete(appSession).where(eq(appSession.refreshTokenHash, hashToken(body.refresh_token)));
  }

  return NextResponse.json({ success: true });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, mcpAccessToken, appSession } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Sign out everywhere: browser sessions, the native apps and every MCP
 * connection (AI assistants) in every organization.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = session.user.id;

    await db
      .update(users)
      .set({ sessionRevokedAt: new Date() })
      .where(eq(users.id, userId));

    // Refresh tokens cascade with their access token
    await db.delete(mcpAccessToken).where(eq(mcpAccessToken.userId, userId));
    await db.delete(appSession).where(eq(appSession.userId, userId));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

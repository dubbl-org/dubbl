import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appSession } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getRequestUserId } from "@/lib/api/app-auth";

/** Native apps (iOS) the user is signed in to. */
export async function GET(request: Request) {
  try {
    const userId = await getRequestUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const sessions = await db.query.appSession.findMany({
      where: eq(appSession.userId, userId),
      orderBy: [desc(appSession.createdAt)],
      columns: {
        id: true,
        platform: true,
        deviceName: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ sessions });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

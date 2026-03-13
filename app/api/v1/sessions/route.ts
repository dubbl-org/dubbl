import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { loginHistory } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const history = await db.query.loginHistory.findMany({
      where: eq(loginHistory.userId, session.user.id),
      orderBy: [desc(loginHistory.createdAt)],
      limit: 20,
      columns: {
        id: true,
        displayLabel: true,
        provider: true,
        alerted: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ sessions: history });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

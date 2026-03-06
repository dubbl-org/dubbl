import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const linkedAccounts = await db.query.accounts.findMany({
      where: eq(accounts.userId, session.user.id),
      columns: { id: true, provider: true, type: true },
    });

    return NextResponse.json({ accounts: linkedAccounts });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ isSiteAdmin: false });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { isSiteAdmin: true },
    });

    return NextResponse.json({ isSiteAdmin: user?.isSiteAdmin ?? false });
  } catch {
    return NextResponse.json({ isSiteAdmin: false });
  }
}

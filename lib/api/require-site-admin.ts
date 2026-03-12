import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Verify the current session user is a site admin.
 * Returns the userId on success, or a NextResponse error.
 */
export async function requireSiteAdmin(): Promise<
  { userId: string } | NextResponse
> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { isSiteAdmin: true },
  });

  if (!user?.isSiteAdmin) {
    return NextResponse.json(
      { error: "Site admin access required" },
      { status: 403 }
    );
  }

  return { userId: session.user.id };
}

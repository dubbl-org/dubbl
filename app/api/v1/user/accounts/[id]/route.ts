import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    // Check if user has a password or other auth methods
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { passwordHash: true },
    });

    const allAccounts = await db.query.accounts.findMany({
      where: eq(accounts.userId, session.user.id),
      columns: { id: true },
    });

    const hasPassword = !!user?.passwordHash;
    const otherAccounts = allAccounts.filter((a) => a.id !== id);

    if (!hasPassword && otherAccounts.length === 0) {
      return NextResponse.json(
        { error: "Cannot unlink your last authentication method" },
        { status: 400 }
      );
    }

    await db
      .delete(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, session.user.id)));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

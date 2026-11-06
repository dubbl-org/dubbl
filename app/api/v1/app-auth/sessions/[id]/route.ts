import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appSession } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getRequestUserId } from "@/lib/api/app-auth";

/** Sign one native app out remotely. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getRequestUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    const deleted = await db
      .delete(appSession)
      .where(and(eq(appSession.id, id), eq(appSession.userId, userId)))
      .returning({ id: appSession.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

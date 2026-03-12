import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { handleError } from "@/lib/api/response";
import { requireSiteAdmin } from "@/lib/api/require-site-admin";

export async function GET() {
  try {
    const result = await requireSiteAdmin();
    if (result instanceof NextResponse) return result;

    const allUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        isSiteAdmin: users.isSiteAdmin,
        createdAt: users.createdAt,
        orgCount: sql<number>`(select count(*) from member where member.user_id = ${users.id})`.as("org_count"),
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    return NextResponse.json({ users: allUsers });
  } catch (err) {
    return handleError(err);
  }
}

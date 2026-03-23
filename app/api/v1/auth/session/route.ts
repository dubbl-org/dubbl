import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyMobileToken } from "@/lib/auth/mobile-token";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyMobileToken(token);
  if (!payload?.sub) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.sub),
    columns: { id: true, name: true, email: true, image: true, isSiteAdmin: true, sessionRevokedAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // Check session revocation
  if (user.sessionRevokedAt && payload.iat < Math.floor(user.sessionRevokedAt.getTime() / 1000)) {
    return NextResponse.json({ error: "Session expired. Please sign in again." }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    isSiteAdmin: user.isSiteAdmin,
  });
}

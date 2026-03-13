import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orgInviteLink } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Public endpoint - returns basic info about an invite link (no auth required)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const link = await db.query.orgInviteLink.findFirst({
    where: eq(orgInviteLink.token, token),
    with: { organization: true },
  });

  if (!link) {
    return NextResponse.json({ error: "Invite link not found" }, { status: 404 });
  }

  if (!link.isActive) {
    return NextResponse.json({ error: "This invite link has been disabled" }, { status: 400 });
  }

  if (link.expiresAt && new Date() > link.expiresAt) {
    return NextResponse.json({ error: "This invite link has expired" }, { status: 410 });
  }

  if (link.maxUses && link.useCount >= link.maxUses) {
    return NextResponse.json({ error: "This invite link has reached its maximum uses" }, { status: 400 });
  }

  return NextResponse.json({
    orgName: link.organization?.name || "Unknown",
    defaultRole: link.defaultRole,
  });
}

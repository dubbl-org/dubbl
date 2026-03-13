import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invitation } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Public endpoint - returns basic info about an invitation (no auth required)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const inv = await db.query.invitation.findFirst({
    where: eq(invitation.token, token),
    with: { organization: true, invitedBy: true },
  });

  if (!inv) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  if (inv.status !== "pending") {
    return NextResponse.json({ error: `This invitation has been ${inv.status}` }, { status: 400 });
  }

  if (new Date() > inv.expiresAt) {
    return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
  }

  return NextResponse.json({
    orgName: inv.organization?.name || "Unknown",
    role: inv.role,
    inviterName: inv.invitedBy?.name || inv.invitedBy?.email || "Someone",
    email: inv.email,
  });
}

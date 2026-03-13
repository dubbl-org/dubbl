import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orgInviteLink } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { randomBytes } from "crypto";

// GET - list invite links for the org
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const links = await db.query.orgInviteLink.findMany({
      where: eq(orgInviteLink.organizationId, ctx.organizationId),
      with: { createdBy: true },
      orderBy: (link, { desc }) => [desc(link.createdAt)],
    });

    return NextResponse.json({
      links: links.map((l) => ({
        id: l.id,
        token: l.token,
        defaultRole: l.defaultRole,
        isActive: l.isActive,
        maxUses: l.maxUses,
        useCount: l.useCount,
        createdByName: l.createdBy?.name || l.createdBy?.email || "Unknown",
        expiresAt: l.expiresAt?.toISOString() || null,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST - create a new invite link
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "invite:members");

    const body = await request.json().catch(() => ({}));
    const defaultRole = body.defaultRole === "admin" ? "admin" : "member";
    const maxUses = typeof body.maxUses === "number" && body.maxUses > 0 ? body.maxUses : null;
    const expiresInDays = typeof body.expiresInDays === "number" && body.expiresInDays > 0 ? body.expiresInDays : null;

    const token = randomBytes(16).toString("hex");
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

    const [link] = await db
      .insert(orgInviteLink)
      .values({
        organizationId: ctx.organizationId,
        token,
        defaultRole,
        maxUses,
        expiresAt,
        createdById: ctx.userId,
      })
      .returning();

    return NextResponse.json({ link: { ...link, expiresAt: link.expiresAt?.toISOString() || null, createdAt: link.createdAt.toISOString() } }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

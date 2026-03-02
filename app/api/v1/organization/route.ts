import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization, member } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  defaultCurrency: z.string().min(1).optional(),
  fiscalYearStartMonth: z.number().min(1).max(12).optional(),
});

export async function GET(request: Request) {
  try {
    // If x-organization-id header present, return single org
    const orgId = request.headers.get("x-organization-id");
    if (orgId) {
      const ctx = await getAuthContext(request);
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
      });
      return NextResponse.json({ organization: org });
    }

    // Otherwise list all orgs for the session user
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const memberships = await db.query.member.findMany({
      where: eq(member.userId, session.user.id),
      with: { organization: true },
    });

    return NextResponse.json({
      organizations: memberships.map((m) => m.organization),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:billing"); // Only owner can edit org settings

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const [updated] = await db
      .update(organization)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(organization.id, ctx.organizationId))
      .returning();

    return NextResponse.json({ organization: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

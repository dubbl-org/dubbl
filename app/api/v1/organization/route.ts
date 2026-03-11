import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization, member } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { z } from "zod";
import { nanoid } from "nanoid";
import { isValidBusinessType } from "@/lib/data/business-types";

const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    country: z.string().min(2).max(2).optional().nullable(),
    businessType: z.string().min(1).optional().nullable(),
    defaultCurrency: z.string().min(1).optional(),
    fiscalYearStartMonth: z.number().min(1).max(12).optional(),
    countryCode: z.string().max(2).nullable().optional(),
    taxId: z.string().nullable().optional(),
    businessRegistrationNumber: z.string().nullable().optional(),
    legalEntityType: z.string().nullable().optional(),
    addressStreet: z.string().nullable().optional(),
    addressCity: z.string().nullable().optional(),
    addressState: z.string().nullable().optional(),
    addressPostalCode: z.string().nullable().optional(),
    addressCountry: z.string().nullable().optional(),
    contactPhone: z.string().nullable().optional(),
    contactEmail: z.string().nullable().optional(),
    contactWebsite: z.string().nullable().optional(),
    defaultPaymentTerms: z.string().nullable().optional(),
    industrySector: z.string().nullable().optional(),
    referralSource: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.businessType && data.country) {
        return isValidBusinessType(data.country, data.businessType);
      }
      return true;
    },
    { message: "Invalid business type for the selected country", path: ["businessType"] }
  );

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
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

    // Enrich with role and member count
    const orgIds = memberships.map((m) => m.organizationId);
    let memberCounts: Record<string, number> = {};

    if (orgIds.length > 0) {
      const counts = await db
        .select({
          organizationId: member.organizationId,
          count: sql<number>`count(*)::int`,
        })
        .from(member)
        .where(
          sql`${member.organizationId} IN ${orgIds}`
        )
        .groupBy(member.organizationId);
      memberCounts = Object.fromEntries(
        counts.map((c) => [c.organizationId, c.count])
      );
    }

    return NextResponse.json({
      organizations: memberships.map((m) => ({
        ...m.organization,
        role: m.role,
        memberCount: memberCounts[m.organizationId] || 1,
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createSchema.parse(body);

    // Check slug uniqueness
    const existing = await db.query.organization.findFirst({
      where: eq(organization.slug, parsed.slug),
    });
    if (existing) {
      return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
    }

    // Create org + owner membership in a transaction
    const orgId = nanoid();
    await db.transaction(async (tx) => {
      await tx.insert(organization).values({
        id: orgId,
        name: parsed.name,
        slug: parsed.slug,
      });
      await tx.insert(member).values({
        organizationId: orgId,
        userId: session.user!.id!,
        role: "owner",
      });
    });

    const created = await db.query.organization.findFirst({
      where: eq(organization.id, orgId),
    });

    return NextResponse.json({ organization: created }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
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

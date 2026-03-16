import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization, member, users, subscription } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { z } from "zod";
import { randomUUID } from "crypto";
import { isValidBusinessType } from "@/lib/data/business-types";
import { checkOrganizationLimit, LimitExceededError } from "@/lib/api/check-limit";
import { logAudit, diffChanges } from "@/lib/api/audit";
import { getSiteSetting, isSelfHostedUnlimited } from "@/lib/site-settings";
import { render } from "@react-email/render";
import { createElement } from "react";
import { OrgCreatedEmail } from "@/lib/email/templates/org-created";
import { sendPlatformEmail } from "@/lib/email/resend-client";
import { seedDefaultAccounts } from "@/lib/db/default-accounts";

const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    country: z.string().min(1).optional().nullable(),
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
      if (data.businessType && (data.countryCode || data.country)) {
        const code = data.countryCode || data.country!;
        return isValidBusinessType(code, data.businessType);
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

    // Check if user is allowed to create organizations
    const allowUserOrgCreation = await getSiteSetting("allow_user_org_creation");
    if (allowUserOrgCreation !== "true") {
      const user = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
        columns: { isSiteAdmin: true },
      });
      if (!user?.isSiteAdmin) {
        return NextResponse.json(
          { error: "Only administrators can create organizations" },
          { status: 403 }
        );
      }
    }

    // Check org limit
    await checkOrganizationLimit(session.user.id);

    // Check slug uniqueness
    const existing = await db.query.organization.findFirst({
      where: eq(organization.slug, parsed.slug),
    });
    if (existing) {
      return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
    }

    // Create org + owner membership + subscription in a transaction
    const orgId = randomUUID();
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
      const selfHosted = isSelfHostedUnlimited();
      await tx.insert(subscription).values({
        organizationId: orgId,
        plan: selfHosted ? "pro" : "free",
        status: "active",
        ...(selfHosted ? { managedBy: "manual" } : {}),
      });
    });

    const created = await db.query.organization.findFirst({
      where: eq(organization.id, orgId),
    });

    // Send org-created email (fire and forget)
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user!.id!),
    });
    if (user) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.dubbl.dev";
      render(createElement(OrgCreatedEmail, { userName: user.name || "there", orgName: parsed.name, dashboardUrl: `${appUrl}/dashboard` }))
        .then((html) => sendPlatformEmail({ to: user.email, subject: `${parsed.name} is ready`, html }))
        .catch(() => {});
    }

    logAudit({ ctx: { organizationId: orgId, userId: session.user!.id!, role: "owner", permissions: [] }, action: "create", entityType: "organization", entityId: orgId, request });

    return NextResponse.json({ organization: created }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof LimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("POST /organization error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:billing"); // Only owner can edit org settings

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });

    const [updated] = await db
      .update(organization)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(organization.id, ctx.organizationId))
      .returning();

    // Seed default chart of accounts on first-time country set (onboarding completion)
    if (existing?.country === null && updated.country !== null) {
      await seedDefaultAccounts(ctx.organizationId, updated.defaultCurrency || "USD", updated.countryCode || undefined);
    }

    logAudit({ ctx, action: "update", entityType: "organization", entityId: ctx.organizationId, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json({ organization: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("PATCH /organization error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

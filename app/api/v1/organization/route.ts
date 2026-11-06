import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization, member, users, subscription, journalEntry } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { isValidCurrencyCode } from "@/lib/currency/iso4217";
import { auth } from "@/lib/auth";
import { getAuthContext, AuthError } from "@/lib/api/auth-context";
import { getRequestUserId } from "@/lib/api/app-auth";
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
import { setUpOrganization } from "@/lib/api/org-setup";
import { deleteOrganization } from "@/lib/api/delete-organization";
import { getChartTemplate } from "@/lib/db/chart-templates";
import { getCountrySetup } from "@/lib/country-setup";
import { toAppUrl } from "@/lib/public-url";

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
    peppolId: z.string().nullable().optional(),
    peppolScheme: z.string().nullable().optional(),
    // Late-payment interest for Charge interest on overdue invoices: annual
    // rate in basis points (850 = 8.5%, null = not set), simple or daily
    // compound, and days after the due date before interest starts.
    interestRate: z.number().int().min(0).max(100000).nullable().optional(),
    interestMethod: z.enum(["simple", "compound"]).nullable().optional(),
    interestGraceDays: z.number().int().min(0).max(3650).optional(),
    // Set-up choices (first country save): which default chart to use — omit
    // for the country's default — and whether the business is registered for
    // VAT/GST/sales tax (false = rates seeded, but defaulting to "No VAT").
    chartTemplate: z.string().optional(),
    registeredForTax: z.boolean().optional(),
    vatScheme: z.enum(["accrual", "cash"]).optional(),
    // Getting-started checklist: client sends true to mark onboarding done
    // (stored as now()), or null to re-open it. Coerced to a Date below.
    onboardingCompleted: z.boolean().optional(),
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
    // Return the single org when one is picked: by x-organization-id, or by an
    // API key (a key already belongs to exactly one organization)
    const orgId = request.headers.get("x-organization-id");
    const isApiKey = request.headers.get("authorization")?.startsWith("Bearer dk_");
    if (orgId || isApiKey) {
      const ctx = await getAuthContext(request);
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, ctx.organizationId),
      });
      return NextResponse.json({ organization: org });
    }

    // Otherwise list all orgs for the signed-in user (browser session or native app)
    const userId = await getRequestUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const memberships = await db.query.member.findMany({
      where: eq(member.userId, userId),
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
      const [user, existingMembership] = await Promise.all([
        db.query.users.findFirst({
          where: eq(users.id, session.user.id),
          columns: { isSiteAdmin: true },
        }),
        db.query.member.findFirst({
          where: eq(member.userId, session.user.id),
          columns: { id: true },
        }),
      ]);

      if (!user?.isSiteAdmin && existingMembership) {
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
      const selfHosted = await isSelfHostedUnlimited();
      await tx.insert(subscription).values({
        organizationId: orgId,
        plan: selfHosted ? "ultimate" : "free",
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
      render(createElement(OrgCreatedEmail, { userName: user.name || "there", orgName: parsed.name, dashboardUrl: toAppUrl("/dashboard") }))
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

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    // The getting-started checklist can be dismissed by any member, so a
    // non-owner isn't dead-ended on it. Only when the PATCH touches another
    // org-settings field do we require manage:organization (admins and the owner).
    const onlyTogglesOnboarding =
      Object.keys(parsed).length === 1 && parsed.onboardingCompleted !== undefined;
    requireRole(ctx, onlyTogglesOnboarding ? "view:data" : "manage:organization");

    const existing = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });

    // Base (functional) currency is the pivot every report is measured in.
    // Validate it, and treat it as immutable once the books have activity —
    // changing it would corrupt all historical functional-currency values.
    if (parsed.defaultCurrency && parsed.defaultCurrency !== existing?.defaultCurrency) {
      if (!isValidCurrencyCode(parsed.defaultCurrency)) {
        return NextResponse.json(
          { error: `${parsed.defaultCurrency} is not a recognized currency code` },
          { status: 400 }
        );
      }
      const [activity] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(journalEntry)
        .where(eq(journalEntry.organizationId, ctx.organizationId));
      if ((activity?.count ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "Base currency can't be changed once transactions exist — it's the functional currency all reports are measured in.",
          },
          { status: 409 }
        );
      }
    }

    // Map the client-friendly `onboardingCompleted` flag onto the real
    // `onboardingCompletedAt` timestamp column (now() to complete, null to re-open).
    const { onboardingCompleted, chartTemplate, registeredForTax, ...rest } = parsed;
    if (chartTemplate !== undefined && !getChartTemplate(chartTemplate)) {
      return NextResponse.json({ error: `Unknown chart template "${chartTemplate}"` }, { status: 400 });
    }
    // The tax regime follows the country unless the business isn't registered.
    const regimePatch =
      registeredForTax === undefined
        ? {}
        : { taxRegime: registeredForTax ? getCountrySetup(rest.countryCode ?? existing?.countryCode).regime : "none" };
    const onboardingPatch =
      onboardingCompleted === undefined
        ? {}
        : { onboardingCompletedAt: onboardingCompleted ? new Date() : null };

    const [updated] = await db
      .update(organization)
      .set({ ...rest, ...regimePatch, ...onboardingPatch, updatedAt: new Date() })
      .where(eq(organization.id, ctx.organizationId))
      .returning();

    // First-time country set (onboarding completion): set the org up the way
    // Xero does — the country's default chart (Xero-style codes or the national
    // chart), its standard tax rates and each account's default tax rate — so
    // the first invoice can pick a real VAT/GST rate immediately.
    let setup = null;
    if (existing?.country === null && updated.country !== null) {
      setup = await setUpOrganization(ctx.organizationId, {
        countryCode: updated.countryCode || null,
        chartTemplate: chartTemplate ?? null,
        registeredForTax,
      });
    }

    logAudit({ ctx, action: "update", entityType: "organization", entityId: ctx.organizationId, changes: diffChanges(existing as Record<string, unknown>, updated as Record<string, unknown>), request });

    return NextResponse.json({ organization: updated, ...(setup ? { setup } : {}) });
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

const deleteSchema = z.object({
  // The organization's name, typed by the owner to confirm.
  confirmName: z.string(),
});

// Permanently delete the organization and all its data (owner only).
export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "delete:organization");

    const parsed = deleteSchema.parse(await request.json().catch(() => ({})));
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    if (parsed.confirmName.trim() !== org.name.trim()) {
      return NextResponse.json(
        { error: "Type the organization's name exactly to confirm" },
        { status: 400 }
      );
    }

    await deleteOrganization(ctx.organizationId);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("DELETE /organization error:", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

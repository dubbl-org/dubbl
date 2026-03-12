import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization, subscription, member, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { handleError } from "@/lib/api/response";
import { requireSiteAdmin } from "@/lib/api/require-site-admin";
import { PLAN_LIMITS, getEffectiveLimits, type PlanName } from "@/lib/plans";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireSiteAdmin();
    if (result instanceof NextResponse) return result;

    const { id } = await params;

    const org = await db.query.organization.findFirst({
      where: eq(organization.id, id),
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const sub = await db.query.subscription.findFirst({
      where: eq(subscription.organizationId, id),
    });

    const members = await db
      .select({
        id: member.id,
        userId: member.userId,
        role: member.role,
        createdAt: member.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(member)
      .innerJoin(users, eq(member.userId, users.id))
      .where(eq(member.organizationId, id));

    const effectiveLimits = getEffectiveLimits(sub ? {
      plan: sub.plan as PlanName,
      overrideMembers: sub.overrideMembers,
      overrideStorageMb: sub.overrideStorageMb,
      overrideContacts: sub.overrideContacts,
      overrideInvoicesPerMonth: sub.overrideInvoicesPerMonth,
      overrideProjects: sub.overrideProjects,
      overrideBankAccounts: sub.overrideBankAccounts,
      overrideCurrencies: sub.overrideCurrencies,
      overrideEntriesPerMonth: sub.overrideEntriesPerMonth,
    } : null);

    return NextResponse.json({
      organization: org,
      subscription: sub ?? {
        plan: "free",
        status: "active",
        seatCount: 1,
        managedBy: "stripe",
        customPlanName: null,
        adminNotes: null,
      },
      members,
      effectiveLimits,
      planDefaults: PLAN_LIMITS[sub?.plan as PlanName ?? "free"],
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireSiteAdmin();
    if (result instanceof NextResponse) return result;

    const { id } = await params;
    const body = await request.json();

    // Update subscription fields
    const subFields: Record<string, unknown> = {};
    if (body.plan && ["free", "pro", "business"].includes(body.plan)) {
      subFields.plan = body.plan;
    }
    if (body.status && ["active", "canceled", "past_due", "trialing", "incomplete"].includes(body.status)) {
      subFields.status = body.status;
    }
    if (typeof body.seatCount === "number") subFields.seatCount = body.seatCount;
    if (typeof body.customPlanName === "string") subFields.customPlanName = body.customPlanName || null;
    if (typeof body.managedBy === "string" && ["stripe", "manual"].includes(body.managedBy)) {
      subFields.managedBy = body.managedBy;
    }
    if (typeof body.adminNotes === "string") subFields.adminNotes = body.adminNotes || null;

    // Override fields (null to reset to plan default)
    const overrideKeys = [
      "overrideMembers",
      "overrideStorageMb",
      "overrideContacts",
      "overrideInvoicesPerMonth",
      "overrideProjects",
      "overrideBankAccounts",
      "overrideCurrencies",
      "overrideEntriesPerMonth",
    ] as const;

    for (const key of overrideKeys) {
      if (key in body) {
        subFields[key] = body[key] === null || body[key] === "" ? null : Number(body[key]);
      }
    }

    if (Object.keys(subFields).length > 0) {
      subFields.updatedAt = new Date();

      const existing = await db.query.subscription.findFirst({
        where: eq(subscription.organizationId, id),
      });

      if (existing) {
        await db
          .update(subscription)
          .set(subFields)
          .where(eq(subscription.organizationId, id));
      } else {
        await db.insert(subscription).values({
          organizationId: id,
          ...subFields,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

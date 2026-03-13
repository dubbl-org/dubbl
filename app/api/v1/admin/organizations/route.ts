import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { handleError } from "@/lib/api/response";
import { requireSiteAdmin } from "@/lib/api/require-site-admin";

export async function GET() {
  try {
    const result = await requireSiteAdmin();
    if (result instanceof NextResponse) return result;

    const orgs = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        country: organization.country,
        businessType: organization.businessType,
        defaultCurrency: organization.defaultCurrency,
        createdAt: organization.createdAt,
        deletedAt: organization.deletedAt,
        memberCount: sql<number>`(select count(*) from member where member.organization_id = ${organization.id})`.as("member_count"),
        // Subscription info via subquery
        plan: sql<string>`coalesce((select s.plan from subscription s where s.organization_id = ${organization.id} limit 1), 'free')`.as("plan"),
        subscriptionStatus: sql<string>`(select s.status from subscription s where s.organization_id = ${organization.id} limit 1)`.as("subscription_status"),
        customPlanName: sql<string>`(select s.custom_plan_name from subscription s where s.organization_id = ${organization.id} limit 1)`.as("custom_plan_name"),
        managedBy: sql<string>`(select s.managed_by from subscription s where s.organization_id = ${organization.id} limit 1)`.as("managed_by"),
        seatCount: sql<number>`(select s.seat_count from subscription s where s.organization_id = ${organization.id} limit 1)`.as("seat_count"),
      })
      .from(organization)
      .orderBy(desc(organization.createdAt));

    return NextResponse.json({ organizations: orgs });
  } catch (err) {
    return handleError(err);
  }
}

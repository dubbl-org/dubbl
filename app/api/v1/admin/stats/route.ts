import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, organization, member, subscription } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";
import { handleError } from "@/lib/api/response";
import { requireSiteAdmin } from "@/lib/api/require-site-admin";

export async function GET() {
  try {
    const result = await requireSiteAdmin();
    if (result instanceof NextResponse) return result;

    const [userCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users);

    const [orgCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(organization);

    const [memberCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(member);

    const planBreakdown = await db
      .select({
        plan: subscription.plan,
        count: sql<number>`count(*)`,
      })
      .from(subscription)
      .groupBy(subscription.plan);

    // Orgs without a subscription row are on free
    const subsOrgCount = planBreakdown.reduce((sum, r) => sum + Number(r.count), 0);
    const freeWithoutSub = Number(orgCount.count) - subsOrgCount;
    const freeRow = planBreakdown.find((r) => r.plan === "free");
    if (freeRow) {
      freeRow.count = Number(freeRow.count) + freeWithoutSub;
    } else if (freeWithoutSub > 0) {
      planBreakdown.push({ plan: "free", count: freeWithoutSub });
    }

    // Recent signups (last 30 days)
    const [recentUsers] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(sql`${users.createdAt} > now() - interval '30 days'`);

    const [recentOrgs] = await db
      .select({ count: sql<number>`count(*)` })
      .from(organization)
      .where(sql`${organization.createdAt} > now() - interval '30 days'`);

    // Manual/enterprise subscriptions
    const [enterpriseCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(subscription)
      .where(eq(subscription.managedBy, "manual"));

    return NextResponse.json({
      totalUsers: Number(userCount.count),
      totalOrgs: Number(orgCount.count),
      totalMembers: Number(memberCount.count),
      recentUsers: Number(recentUsers.count),
      recentOrgs: Number(recentOrgs.count),
      enterpriseOrgs: Number(enterpriseCount.count),
      planBreakdown: planBreakdown.map((r) => ({
        plan: r.plan,
        count: Number(r.count),
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

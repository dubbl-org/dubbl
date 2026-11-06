import { db } from "@/lib/db";
import { bankAccount, project, payrollEmployee } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { emailUsage, getOrgPlanLimits, memberCapacity, storageUsage } from "@/lib/api/check-limit";
import { PLAN_INFO, type PlanLimits } from "@/lib/plans";
import { isSelfHostedUnlimited } from "@/lib/site-settings";

/** Infinity doesn't survive JSON; unlimited is sent as null. */
const finite = (n: number) => (Number.isFinite(n) ? n : null);

export type SerializedLimits = { [K in keyof PlanLimits]: PlanLimits[K] extends number ? number | null : PlanLimits[K] };

export function serializeLimits(limits: PlanLimits): SerializedLimits {
  return Object.fromEntries(
    Object.entries(limits).map(([k, v]) => [k, typeof v === "number" ? finite(v) : v])
  ) as SerializedLimits;
}

async function countActive(table: typeof bankAccount | typeof project, orgId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(table)
    .where(and(eq(table.organizationId, orgId), isNull(table.deletedAt)));
  return row?.count ?? 0;
}

/**
 * Everything the billing page and the MCP billing tools show: the plan, its
 * limits (null = unlimited) and how much of each the organization uses.
 */
export async function getBillingSummary(orgId: string) {
  const [{ sub, limits, plan }, members, storage, emails, bankAccounts, projects, [employees]] = await Promise.all([
    getOrgPlanLimits(orgId),
    memberCapacity(orgId),
    storageUsage(orgId),
    emailUsage(orgId),
    countActive(bankAccount, orgId),
    countActive(project, orgId),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(payrollEmployee)
      .where(
        and(
          eq(payrollEmployee.organizationId, orgId),
          eq(payrollEmployee.isActive, true),
          isNull(payrollEmployee.deletedAt)
        )
      ),
  ]);

  return {
    selfHosted: await isSelfHostedUnlimited(),
    plan,
    planName: sub?.customPlanName || PLAN_INFO[plan].name,
    status: sub?.status ?? "active",
    billingInterval: (sub?.billingInterval === "annual" ? "annual" : "monthly") as "monthly" | "annual",
    currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    managedBy: sub?.managedBy ?? "stripe",
    hasStripeSubscription: !!sub?.stripeSubscriptionId,
    limits: serializeLimits(limits),
    usage: {
      members: { used: members.current, max: finite(members.max) },
      employees: { used: employees?.count ?? 0, max: finite(limits.employees) },
      bankAccounts: { used: bankAccounts, max: finite(limits.bankAccounts) },
      projects: { used: projects, max: finite(limits.projects) },
      storageBytes: { used: storage.usedBytes, max: finite(storage.maxBytes) },
      emailsThisMonth: { used: emails.sent, max: finite(emails.max) },
    },
  };
}

export type BillingSummary = Awaited<ReturnType<typeof getBillingSummary>>;

import { db } from "@/lib/db";
import { subscription, document, attachment, organization } from "@/lib/db/schema";
import { eq, and, gte, sql, isNull } from "drizzle-orm";
import { getEffectiveLimits, STORAGE_PLANS, type PlanName, type StoragePlanName } from "@/lib/plans";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

export class LimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitExceededError";
  }
}

export async function getOrgPlanLimits(orgId: string) {
  const sub = await db.query.subscription.findFirst({
    where: eq(subscription.organizationId, orgId),
  });
  const limits = getEffectiveLimits(
    sub
      ? {
          plan: sub.plan as PlanName,
          overrideMembers: sub.overrideMembers,
          overrideStorageMb: sub.overrideStorageMb,
          overrideContacts: sub.overrideContacts,
          overrideInvoicesPerMonth: sub.overrideInvoicesPerMonth,
          overrideProjects: sub.overrideProjects,
          overrideBankAccounts: sub.overrideBankAccounts,
          overrideMultiCurrency: sub.overrideMultiCurrency,
          overrideEntriesPerMonth: sub.overrideEntriesPerMonth,
        }
      : null
  );
  return { sub, limits };
}

export async function checkResourceLimit(
  orgId: string,
  resourceTable: PgTable,
  orgIdColumn: PgColumn,
  limitKey: "contacts" | "bankAccounts" | "projects",
  deletedAtColumn?: PgColumn
) {
  const { limits } = await getOrgPlanLimits(orgId);
  const max = limits[limitKey];
  if (max === Infinity) return;

  const conditions = [eq(orgIdColumn, orgId)];
  if (deletedAtColumn) conditions.push(isNull(deletedAtColumn));

  const [countResult] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(resourceTable)
    .where(and(...conditions));

  const current = countResult?.count ?? 0;
  if (current >= max) {
    throw new LimitExceededError(
      `You've reached the limit of ${max} ${limitKey}. Upgrade your plan for more.`
    );
  }
}

export async function checkMonthlyLimit(
  orgId: string,
  resourceTable: PgTable,
  orgIdColumn: PgColumn,
  dateColumn: PgColumn,
  limitKey: "entriesPerMonth" | "invoicesPerMonth",
  deletedAtColumn?: PgColumn
) {
  const { limits } = await getOrgPlanLimits(orgId);
  const max = limits[limitKey];
  if (max === Infinity) return;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const conditions = [
    eq(orgIdColumn, orgId),
    gte(dateColumn, monthStart),
  ];
  if (deletedAtColumn) conditions.push(isNull(deletedAtColumn));

  const [countResult] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(resourceTable)
    .where(and(...conditions));

  const current = countResult?.count ?? 0;
  if (current >= max) {
    throw new LimitExceededError(
      `You've reached the limit of ${max} ${limitKey === "entriesPerMonth" ? "entries" : "invoices"} per month. Upgrade your plan for more.`
    );
  }
}

export async function checkStorageLimit(orgId: string, additionalBytes: number = 0) {
  const { sub } = await getOrgPlanLimits(orgId);
  const storagePlan = (sub?.storagePlan ?? "free") as StoragePlanName;
  const maxMb = STORAGE_PLANS[storagePlan].filesMb;

  const [docResult] = await db
    .select({ total: sql<number>`coalesce(sum(${document.fileSize}), 0)` })
    .from(document)
    .where(and(eq(document.organizationId, orgId), isNull(document.deletedAt)));

  const [attResult] = await db
    .select({ total: sql<number>`coalesce(sum(${attachment.fileSize}), 0)` })
    .from(attachment)
    .where(eq(attachment.organizationId, orgId));

  const usedBytes = Number(docResult?.total ?? 0) + Number(attResult?.total ?? 0);
  const maxBytes = maxMb * 1024 * 1024;

  if (usedBytes + additionalBytes > maxBytes) {
    throw new LimitExceededError(
      `Storage limit of ${maxMb >= 1024 ? `${maxMb / 1024} GB` : `${maxMb} MB`} reached. Upgrade your storage plan for more space.`
    );
  }
}

export async function checkMultiCurrency(orgId: string, currencyCode: string) {
  const { limits } = await getOrgPlanLimits(orgId);
  if (limits.multiCurrency) return;

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
  });
  const defaultCurrency = org?.defaultCurrency ?? "USD";

  if (currencyCode && currencyCode !== defaultCurrency) {
    throw new LimitExceededError(
      "Multi-currency requires a Pro or Business plan. Upgrade to use currencies other than your default."
    );
  }
}

export async function checkOrganizationLimit(userId: string) {
  // Count orgs where user is owner
  const { member } = await import("@/lib/db/schema");
  const memberships = await db.query.member.findMany({
    where: eq(member.userId, userId),
  });

  // Find the most permissive plan across all user's orgs
  let maxOrgs = 1; // free default
  for (const m of memberships) {
    const { limits } = await getOrgPlanLimits(m.organizationId);
    if (limits.organizations > maxOrgs) {
      maxOrgs = limits.organizations;
    }
  }

  if (maxOrgs === Infinity) return;
  if (memberships.length >= maxOrgs) {
    throw new LimitExceededError(
      `You've reached the limit of ${maxOrgs} organization${maxOrgs === 1 ? "" : "s"}. Upgrade your plan to create more.`
    );
  }
}

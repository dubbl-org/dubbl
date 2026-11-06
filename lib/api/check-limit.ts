import { db } from "@/lib/db";
import {
  subscription,
  document,
  attachment,
  organization,
  documentEmailLog,
  member,
  invitation,
  payrollEmployee,
  consolidationGroupMember,
  dataBackup,
} from "@/lib/db/schema";
import { eq, and, gte, sql, isNull, inArray } from "drizzle-orm";
import {
  getEffectiveLimits,
  PLAN_INFO,
  PLAN_LIMITS,
  type PlanName,
} from "@/lib/plans";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import { isSelfHostedUnlimited } from "@/lib/site-settings";

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
  const limits = getEffectiveLimits(sub ?? null, await isSelfHostedUnlimited());
  return { sub, limits, plan: (sub?.plan ?? "free") as PlanName };
}

const RESOURCE_LABELS = {
  contacts: "contacts",
  bankAccounts: "bank accounts",
  projects: "projects",
} as const;

export async function checkResourceLimit(
  orgId: string,
  resourceTable: PgTable,
  orgIdColumn: PgColumn,
  limitKey: "contacts" | "bankAccounts" | "projects",
  deletedAtColumn?: PgColumn
) {
  const { limits, plan } = await getOrgPlanLimits(orgId);
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
      `The ${PLAN_INFO[plan].name} plan includes ${max} ${RESOURCE_LABELS[limitKey]}. Upgrade for unlimited ${RESOURCE_LABELS[limitKey]}.`
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

const formatMb = (mb: number) => (mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`);

/** Bytes stored by the workspace (documents and journal attachments) and the plan's allowance. */
export async function storageUsage(orgId: string) {
  const { limits } = await getOrgPlanLimits(orgId);
  const maxBytes = limits.storageMb * 1024 * 1024;
  const [docResult] = await db
    .select({ total: sql<number>`coalesce(sum(${document.fileSize}), 0)` })
    .from(document)
    .where(and(eq(document.organizationId, orgId), isNull(document.deletedAt)));
  const [attResult] = await db
    .select({ total: sql<number>`coalesce(sum(${attachment.fileSize}), 0)` })
    .from(attachment)
    .where(eq(attachment.organizationId, orgId));
  return { usedBytes: Number(docResult?.total ?? 0) + Number(attResult?.total ?? 0), maxBytes };
}

export async function checkStorageLimit(orgId: string, additionalBytes: number = 0) {
  const { usedBytes, maxBytes } = await storageUsage(orgId);
  if (maxBytes === Infinity) return;
  if (usedBytes + additionalBytes > maxBytes) {
    throw new LimitExceededError(
      `Your plan includes ${formatMb(maxBytes / 1024 / 1024)} of storage. Upgrade your plan for more space.`
    );
  }
}

export async function checkMultiCurrency(orgId: string, currencyCode: string | null | undefined) {
  const { limits } = await getOrgPlanLimits(orgId);
  if (limits.multiCurrency || !currencyCode) return;

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, orgId),
  });
  const defaultCurrency = org?.defaultCurrency ?? "USD";

  if (currencyCode !== defaultCurrency) {
    throw new LimitExceededError(
      `Multi-currency is included from the Standard plan. Upgrade to use currencies other than ${defaultCurrency}.`
    );
  }
}

/** The plan's monthly email allowance and how many have been sent this month. */
export async function emailUsage(orgId: string) {
  const { limits } = await getOrgPlanLimits(orgId);
  const max = limits.emailsPerMonth;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(documentEmailLog)
    .where(
      and(
        eq(documentEmailLog.organizationId, orgId),
        eq(documentEmailLog.status, "sent"),
        gte(documentEmailLog.sentAt, monthStart)
      )
    );
  return { sent: countResult?.count ?? 0, max };
}

export async function checkEmailLimit(orgId: string) {
  const { sent, max } = await emailUsage(orgId);
  if (max === Infinity) return;
  if (sent >= max) {
    throw new LimitExceededError(
      `You've reached the limit of ${max.toLocaleString("en-US")} emails per month. Upgrade your plan for more.`
    );
  }
}

/** Active (not ended, not deleted) payroll employees against the plan's headcount. */
export async function checkEmployeeLimit(orgId: string) {
  const { limits, plan } = await getOrgPlanLimits(orgId);
  const max = limits.employees;
  if (max === Infinity) return;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(payrollEmployee)
    .where(
      and(
        eq(payrollEmployee.organizationId, orgId),
        eq(payrollEmployee.isActive, true),
        isNull(payrollEmployee.deletedAt)
      )
    );

  if ((countResult?.count ?? 0) >= max) {
    throw new LimitExceededError(
      `The ${PLAN_INFO[plan].name} plan includes payroll for ${max} employee${max === 1 ? "" : "s"}. Upgrade to pay more people.`
    );
  }
}

/**
 * Consolidation is included from Premium. Pass a group to also check its
 * entity count before adding another member.
 */
export async function checkConsolidation(orgId: string, groupId?: string) {
  const { limits } = await getOrgPlanLimits(orgId);
  const max = limits.consolidationEntities;
  if (max === 0) {
    throw new LimitExceededError("Consolidation is included from the Premium plan. Upgrade to consolidate entities.");
  }
  if (!groupId || max === Infinity) return;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(consolidationGroupMember)
    .where(eq(consolidationGroupMember.groupId, groupId));

  if ((countResult?.count ?? 0) >= max) {
    throw new LimitExceededError(
      `Your plan consolidates up to ${max} entities per group. Upgrade to Ultimate for unlimited entities.`
    );
  }
}

/** Manual backups kept at once (deleted ones don't count). */
export async function checkManualBackupLimit(orgId: string) {
  const { limits } = await getOrgPlanLimits(orgId);
  const max = limits.maxManualBackups;
  if (max === Infinity) return;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(dataBackup)
    .where(
      and(
        eq(dataBackup.organizationId, orgId),
        eq(dataBackup.type, "manual"),
        isNull(dataBackup.deletedAt)
      )
    );

  if ((countResult?.count ?? 0) >= max) {
    throw new LimitExceededError(
      `Your plan keeps up to ${max} manual backups. Delete one or upgrade for more.`
    );
  }
}

/**
 * Member capacity: current members (optionally plus pending invitations)
 * against the plan's user limit. `reason` explains why no one can be added.
 */
export async function memberCapacity(orgId: string, { includePending = false } = {}) {
  const { sub, limits, plan } = await getOrgPlanLimits(orgId);

  const [members] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(member)
    .where(eq(member.organizationId, orgId));
  let current = members?.count ?? 0;

  if (includePending) {
    const [pending] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(invitation)
      .where(and(eq(invitation.organizationId, orgId), eq(invitation.status, "pending")));
    current += pending?.count ?? 0;
  }

  const status = sub?.status ?? "active";
  const billingOk = status !== "past_due" && status !== "incomplete";
  const max = limits.members;

  let reason: string | null = null;
  if (!billingOk) {
    reason = "Your billing is past due. Update your payment method to add members.";
  } else if (current >= max) {
    reason =
      plan === "free" && sub?.overrideMembers == null
        ? `The Free plan includes ${max} user. Upgrade to Standard for unlimited users.`
        : `You've reached your plan's limit of ${max} members. Contact support to raise it.`;
  }

  return { current, max, plan, status, billingOk, canAdd: reason === null, reason };
}

/**
 * Each user may own a limited number of free organizations; paid
 * organizations never count. Self-hosted deployments are unlimited.
 */
export async function checkOrganizationLimit(userId: string) {
  if (await isSelfHostedUnlimited()) return;

  const owned = await db.query.member.findMany({
    where: and(eq(member.userId, userId), eq(member.role, "owner")),
    columns: { organizationId: true },
  });
  if (owned.length === 0) return;

  const subs = await db.query.subscription.findMany({
    where: inArray(subscription.organizationId, owned.map((m) => m.organizationId)),
    columns: { organizationId: true, plan: true, overrideMembers: true },
  });
  const paid = new Set(subs.filter((s) => s.plan !== "free").map((s) => s.organizationId));
  const freeOwned = owned.filter((m) => !paid.has(m.organizationId)).length;

  const max = PLAN_LIMITS.free.organizations;
  if (freeOwned >= max) {
    throw new LimitExceededError(
      `Each account includes ${max} free organization. Upgrade your existing organization to a paid plan to create another.`
    );
  }
}

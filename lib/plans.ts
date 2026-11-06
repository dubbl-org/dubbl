/*
 * Subscription plans. Every plan is priced per organization — never per user —
 * and every paid plan includes unlimited users. Prices are USD per month;
 * `annual` is the monthly equivalent when billed yearly.
 *
 * Limits use Infinity for "unlimited". Admin overrides on the subscription row
 * replace individual limits (see getEffectiveLimits).
 */
export type PlanName = "free" | "standard" | "premium" | "ultimate";

export interface PlanLimits {
  /** Free organizations a single user may own (paid orgs don't count). */
  organizations: number;
  members: number;
  /** Active payroll employees. */
  employees: number;
  entriesPerMonth: number;
  invoicesPerMonth: number;
  contacts: number;
  bankAccounts: number;
  projects: number;
  multiCurrency: boolean;
  /** Entities per consolidation group; 0 means consolidation is not included. */
  consolidationEntities: number;
  storageMb: number;
  emailsPerMonth: number;
  apiAccess: boolean;
  auditLogDays: number;
  backupRetentionDays: number;
  maxManualBackups: number;
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    organizations: 1,
    members: 1,
    employees: 2,
    entriesPerMonth: Infinity,
    invoicesPerMonth: Infinity,
    contacts: Infinity,
    bankAccounts: 3,
    projects: 3,
    multiCurrency: false,
    consolidationEntities: 0,
    storageMb: 2048,
    emailsPerMonth: 200,
    apiAccess: true,
    auditLogDays: 90,
    backupRetentionDays: 7,
    maxManualBackups: 3,
  },
  standard: {
    organizations: Infinity,
    members: Infinity,
    employees: 10,
    entriesPerMonth: Infinity,
    invoicesPerMonth: Infinity,
    contacts: Infinity,
    bankAccounts: Infinity,
    projects: Infinity,
    multiCurrency: true,
    consolidationEntities: 0,
    storageMb: 20480,
    emailsPerMonth: 2000,
    apiAccess: true,
    auditLogDays: 365,
    backupRetentionDays: 30,
    maxManualBackups: 10,
  },
  premium: {
    organizations: Infinity,
    members: Infinity,
    employees: 50,
    entriesPerMonth: Infinity,
    invoicesPerMonth: Infinity,
    contacts: Infinity,
    bankAccounts: Infinity,
    projects: Infinity,
    multiCurrency: true,
    consolidationEntities: 3,
    storageMb: 102400,
    emailsPerMonth: 10000,
    apiAccess: true,
    auditLogDays: 1095,
    backupRetentionDays: 90,
    maxManualBackups: 25,
  },
  ultimate: {
    organizations: Infinity,
    members: Infinity,
    employees: Infinity,
    entriesPerMonth: Infinity,
    invoicesPerMonth: Infinity,
    contacts: Infinity,
    bankAccounts: Infinity,
    projects: Infinity,
    multiCurrency: true,
    consolidationEntities: Infinity,
    storageMb: 512000,
    emailsPerMonth: 50000,
    apiAccess: true,
    auditLogDays: Infinity,
    backupRetentionDays: 365,
    maxManualBackups: 50,
  },
};

/** Paid plans, cheapest first. */
export const PAID_PLANS = ["standard", "premium", "ultimate"] as const;
export type PaidPlanName = (typeof PAID_PLANS)[number];

/** Plans ordered from lowest to highest, for upgrade/downgrade comparisons. */
export const PLAN_ORDER: PlanName[] = ["free", ...PAID_PLANS];

export const PLAN_PRICES: Record<PlanName, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  standard: { monthly: 19, annual: 15 },
  premium: { monthly: 49, annual: 39 },
  ultimate: { monthly: 99, annual: 79 },
};

/** Display copy for each plan, shared by the pricing and billing pages. */
export const PLAN_INFO: Record<PlanName, { name: string; tagline: string; highlights: string[] }> = {
  free: {
    name: "Free",
    tagline: "Everything a one-person business needs.",
    highlights: [
      "1 user",
      "Unlimited invoices, quotes, bills and contacts",
      "Unlimited journal entries",
      "Bank feeds and reconciliation, 3 accounts",
      "Payroll for 2 employees",
      "Every report, API and MCP access",
    ],
  },
  standard: {
    name: "Standard",
    tagline: "For teams. One price, everyone included.",
    highlights: [
      "Unlimited users",
      "Multi-currency",
      "Unlimited bank accounts and projects",
      "Payroll for 10 employees",
      "20 GB storage, 2,000 emails a month",
      "1-year audit history",
    ],
  },
  premium: {
    name: "Premium",
    tagline: "For growing businesses and groups.",
    highlights: [
      "Everything in Standard",
      "Consolidation across 3 entities",
      "Payroll for 50 employees",
      "100 GB storage, 10,000 emails a month",
      "3-year audit history, 90-day backups",
      "Priority support",
    ],
  },
  ultimate: {
    name: "Ultimate",
    tagline: "For large and multi-entity businesses.",
    highlights: [
      "Everything in Premium",
      "Consolidation across unlimited entities",
      "Unlimited payroll employees",
      "500 GB storage, 50,000 emails a month",
      "Unlimited audit history, 1-year backups",
      "Priority support and onboarding",
    ],
  },
};

/** Percentage saved by paying yearly, rounded. */
export function annualSaving(plan: PaidPlanName): number {
  const p = PLAN_PRICES[plan];
  return Math.round((1 - p.annual / p.monthly) * 100);
}

export type BillingInterval = "monthly" | "annual";

// RBAC permissions
const ROLE_HIERARCHY = { owner: 3, admin: 2, member: 1 } as const;
export type MemberRole = keyof typeof ROLE_HIERARCHY;

const PERMISSION_REQUIREMENTS: Record<string, MemberRole> = {
  "view:data": "member",
  "create:entries": "member",
  "edit:entries": "member",
  "post:entries": "admin",
  "void:entries": "admin",
  "manage:accounts": "admin",
  "manage:contacts": "member",
  "manage:tax-rates": "admin",
  "manage:invoices": "member",
  "approve:invoices": "admin",
  "manage:bills": "member",
  "approve:bills": "admin",
  "manage:banking": "admin",
  "manage:expenses": "member",
  "approve:expenses": "admin",
  "manage:inventory": "admin",
  "manage:payroll": "admin",
  "approve:payroll": "admin",
  "manage:timesheets": "member",
  "manage:leave": "member",
  "manage:contractors": "admin",
  "view:payslips": "member",
  "manage:compensation": "admin",
  "manage:tax-config": "admin",
  "manage:shifts": "admin",
  "self-service:payroll": "member",
  "view:payroll-reports": "admin",
  "manage:projects": "member",
  "manage:teams": "admin",
  "manage:assets": "admin",
  "manage:budgets": "admin",
  "manage:credit-notes": "member",
  "manage:debit-notes": "member",
  "manage:payments": "member",
  "manage:recurring": "admin",
  "manage:period-lock": "owner",
  // Two-tier period lock: holders may post into the soft-locked window down to
  // the stricter advisorLockDate (e.g. advisors closing the books).
  "bypass:period-lock": "owner",
  "manage:bank-rules": "admin",
  "manage:cost-centers": "admin",
  "view:audit-log": "admin",
  "invite:members": "admin",
  "change:roles": "admin",
  "remove:members": "admin",
  "manage:api-keys": "admin",
  "manage:webhooks": "admin",
  "manage:approvals": "admin",
  "manage:time-tracking": "member",
  "manage:reports": "admin",
  "manage:integrations": "admin",
  "manage:entries": "member",
  "manage:purchases": "member",
  "manage:accruals": "admin",
  "manage:revenue": "admin",
  "manage:members": "admin",
  "approve:purchases": "admin",
  "manage:organization": "admin",
  "manage:billing": "owner",
  "delete:organization": "owner",
};

/** All available permissions derived from PERMISSION_REQUIREMENTS keys */
export const ALL_PERMISSIONS = Object.keys(PERMISSION_REQUIREMENTS);

/**
 * Permissions that only read/view data (no mutations). Used to build the
 * Read-only preset role and to flag which permissions are non-mutating.
 */
export const READ_ONLY_PERMISSIONS = [
  "view:data",
  "view:payslips",
  "view:payroll-reports",
  "view:audit-log",
];

/**
 * Built-in preset roles seeded as system roles (isSystem: true) for every
 * organization. These give administrators sensible starting points without
 * having to assemble permission sets by hand. Preset roles are immutable
 * (cannot be edited or deleted) but can be assigned to members like any role.
 *
 * - Read-only: view-only access, no mutating permissions.
 * - Advisor:   every available permission (accountant/advisor full access).
 * - Invoice-only: limited to invoicing, contacts and payments.
 * - Standard:  everyday operational access (no owner/admin-only powers).
 */
export interface PresetRole {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

const INVOICE_ONLY_PERMISSIONS = [
  "view:data",
  "manage:contacts",
  "manage:invoices",
  "manage:quotes",
  "manage:credit-notes",
  "manage:payments",
].filter((p) => ALL_PERMISSIONS.includes(p));

const STANDARD_PERMISSIONS = [
  "view:data",
  "create:entries",
  "edit:entries",
  "manage:contacts",
  "manage:invoices",
  "manage:bills",
  "manage:expenses",
  "manage:payments",
  "manage:credit-notes",
  "manage:debit-notes",
  "manage:purchases",
  "manage:projects",
  "manage:timesheets",
  "manage:leave",
  "manage:time-tracking",
  "manage:entries",
].filter((p) => ALL_PERMISSIONS.includes(p));

export const PRESET_ROLES: PresetRole[] = [
  {
    key: "read-only",
    name: "Read-only",
    description: "View-only access to financial data with no ability to make changes.",
    permissions: READ_ONLY_PERMISSIONS.filter((p) => ALL_PERMISSIONS.includes(p)),
  },
  {
    key: "advisor",
    name: "Advisor",
    description: "Full access to every feature — intended for accountants and advisors.",
    permissions: [...ALL_PERMISSIONS],
  },
  {
    key: "invoice-only",
    name: "Invoice-only",
    description: "Limited to creating invoices, quotes, credit notes and managing contacts and payments.",
    permissions: INVOICE_ONLY_PERMISSIONS,
  },
  {
    key: "standard",
    name: "Standard",
    description: "Everyday operational access without owner/admin-only powers (no posting, approvals or settings).",
    permissions: STANDARD_PERMISSIONS,
  },
];

/**
 * What an external advisor (Settings > Advisors) can do: everything a member
 * can, plus managing period locks and working down to the stricter advisor
 * lock date, as the invite drawer promises.
 */
export const ADVISOR_PERMISSIONS = [
  ...ALL_PERMISSIONS.filter((p) => PERMISSION_REQUIREMENTS[p] === "member"),
  "manage:period-lock",
  "bypass:period-lock",
];

/** Permission categories for UI grouping */
export const PERMISSION_CATEGORIES: Record<string, string[]> = {
  "General": ["view:data"],
  "Accounting": ["create:entries", "edit:entries", "post:entries", "void:entries", "manage:accounts", "manage:recurring", "manage:period-lock", "bypass:period-lock"],
  "Invoicing": ["manage:invoices", "approve:invoices", "manage:credit-notes", "manage:debit-notes"],
  "Bills": ["manage:bills", "approve:bills"],
  "Banking": ["manage:banking", "manage:bank-rules"],
  "Contacts": ["manage:contacts"],
  "Payments": ["manage:payments"],
  "Expenses": ["manage:expenses", "approve:expenses"],
  "Inventory": ["manage:inventory"],
  "Payroll": ["manage:payroll", "approve:payroll", "manage:timesheets", "manage:leave", "manage:contractors", "view:payslips", "manage:compensation", "manage:tax-config", "manage:shifts", "self-service:payroll", "view:payroll-reports"],
  "Projects": ["manage:projects"],
  "Assets": ["manage:assets"],
  "Budgets": ["manage:budgets"],
  "Tax": ["manage:tax-rates"],
  "Cost Centers": ["manage:cost-centers"],
  "Automation": ["manage:webhooks", "manage:approvals"],
  "Reports": ["manage:reports"],
  "Integrations": ["manage:integrations"],
  "Time Tracking": ["manage:time-tracking"],
  "Purchases": ["manage:purchases", "approve:purchases"],
  "Admin": ["manage:organization", "manage:teams", "manage:members", "invite:members", "change:roles", "remove:members", "manage:api-keys", "view:audit-log"],
  "Owner": ["manage:billing", "delete:organization"],
};

/**
 * Check permission against a legacy MemberRole or a custom permissions array.
 * Owners always have all permissions.
 */
/**
 * True when this deployment runs without Stripe billing. This is the "auto"
 * default only: server code asks `isSelfHostedUnlimited()` in
 * lib/site-settings, which also honours the admin setting.
 */
export function isUnlimitedDeployment(): boolean {
  return !process.env.STRIPE_SECRET_KEY;
}

const UNLIMITED: PlanLimits = {
  ...PLAN_LIMITS.ultimate,
  organizations: Infinity,
  storageMb: Infinity,
  emailsPerMonth: Infinity,
  auditLogDays: Infinity,
  backupRetentionDays: Infinity,
  maxManualBackups: Infinity,
};

/**
 * Get effective limits for an org, respecting admin overrides.
 * Pass the subscription row (or null for free defaults), and whether the
 * instance is in unlimited mode (`await isSelfHostedUnlimited()`), in which
 * case everything is unlimited.
 */
export function getEffectiveLimits(sub: {
  plan: PlanName;
  overrideMembers?: number | null;
  overrideStorageMb?: number | null;
  overrideContacts?: number | null;
  overrideInvoicesPerMonth?: number | null;
  overrideProjects?: number | null;
  overrideBankAccounts?: number | null;
  overrideMultiCurrency?: boolean | null;
  overrideEntriesPerMonth?: number | null;
} | null, unlimited = isUnlimitedDeployment()): PlanLimits {
  if (unlimited) return UNLIMITED;

  const base = PLAN_LIMITS[sub?.plan ?? "free"] ?? PLAN_LIMITS.free;
  return {
    ...base,
    members: sub?.overrideMembers ?? base.members,
    storageMb: sub?.overrideStorageMb ?? base.storageMb,
    contacts: sub?.overrideContacts ?? base.contacts,
    invoicesPerMonth: sub?.overrideInvoicesPerMonth ?? base.invoicesPerMonth,
    projects: sub?.overrideProjects ?? base.projects,
    bankAccounts: sub?.overrideBankAccounts ?? base.bankAccounts,
    multiCurrency: sub?.overrideMultiCurrency ?? base.multiCurrency,
    entriesPerMonth: sub?.overrideEntriesPerMonth ?? base.entriesPerMonth,
  };
}

export function hasPermission(
  roleOrPermissions: MemberRole | string[],
  permission: string
): boolean {
  // Custom permissions array
  if (Array.isArray(roleOrPermissions)) {
    return roleOrPermissions.includes(permission);
  }

  // Legacy role-based check
  const role = roleOrPermissions;

  // Owner always has full access
  if (role === "owner") return true;

  const required = PERMISSION_REQUIREMENTS[permission];
  if (!required) return false;
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[required];
}

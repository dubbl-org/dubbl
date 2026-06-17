export const PLAN_LIMITS = {
  free: {
    organizations: 1,
    members: 1,
    entriesPerMonth: 500,
    multiCurrency: false,
    contacts: 200,
    invoicesPerMonth: 10,
    emailsPerMonth: 25,
    bankAccounts: 1,
    projects: 2,
    reports: ["trial-balance", "general-ledger"] as string[],
    storageMb: 100,
    apiAccess: true,
    auditLogDays: 30,
    backupRetentionDays: 7,
    maxManualBackups: 3,
  },
  pro: {
    organizations: 1,
    members: Infinity,
    entriesPerMonth: Infinity,
    multiCurrency: true,
    contacts: Infinity,
    invoicesPerMonth: Infinity,
    emailsPerMonth: 100,
    bankAccounts: Infinity,
    projects: 20,
    reports: [
      "trial-balance",
      "general-ledger",
      "balance-sheet",
      "income-statement",
      "profit-and-loss",
      "aged-receivables",
      "aged-payables",
      "cash-flow",
      "account-transactions",
    ] as string[],
    storageMb: 5120,
    apiAccess: true,
    auditLogDays: 365,
    backupRetentionDays: 30,
    maxManualBackups: 10,
  },
} as const;

export const STORAGE_PLANS = {
  free: { filesMb: 5120, emailsPerMonth: 100, monthly: 0, annual: 0 },
  starter: { filesMb: 25600, emailsPerMonth: 500, monthly: 15, annual: 13 },
  growth: { filesMb: 76800, emailsPerMonth: 3000, monthly: 45, annual: 38 },
  scale: { filesMb: 307200, emailsPerMonth: 10000, monthly: 120, annual: 100 },
} as const;

export type StoragePlanName = keyof typeof STORAGE_PLANS;

export type PlanName = keyof typeof PLAN_LIMITS;

export const PLAN_PRICES = {
  free: { monthly: 0, annual: 0 },
  pro: { monthly: 12, annual: 10 },
} as const;

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
  "Admin": ["manage:teams", "manage:members", "invite:members", "change:roles", "remove:members", "manage:api-keys", "view:audit-log"],
  "Owner": ["manage:billing", "delete:organization"],
};

/**
 * Check permission against a legacy MemberRole or a custom permissions array.
 * Owners always have all permissions.
 */
/**
 * Get effective limits for an org, respecting admin overrides.
 * Pass the subscription row (or null for free defaults).
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
} | null) {
  // Self-hosted mode: if no Stripe key, everything is unlimited
  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      ...PLAN_LIMITS.pro,
      organizations: Infinity,
      members: Infinity,
      storageMb: Infinity,
      entriesPerMonth: Infinity,
      contacts: Infinity,
      invoicesPerMonth: Infinity,
      emailsPerMonth: Infinity,
      bankAccounts: Infinity,
      projects: Infinity,
      multiCurrency: true,
      apiAccess: true,
      auditLogDays: Infinity,
      backupRetentionDays: Infinity,
      maxManualBackups: Infinity,
      reports: PLAN_LIMITS.pro.reports,
    };
  }

  const plan = sub?.plan ?? "free";
  const base = PLAN_LIMITS[plan];
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

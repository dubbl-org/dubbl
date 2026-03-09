export const PLAN_LIMITS = {
  free: {
    organizations: 1,
    members: 2,
    entriesPerMonth: 500,
    currencies: 1,
    contacts: 50,
    invoicesPerMonth: 10,
    bankAccounts: 1,
    projects: 2,
    reports: ["trial-balance", "general-ledger"] as string[],
    storageMb: 100,
    apiAccess: false,
    auditLogDays: 30,
  },
  pro: {
    organizations: 3,
    members: 10,
    entriesPerMonth: Infinity,
    currencies: 5,
    contacts: 500,
    invoicesPerMonth: 100,
    bankAccounts: 5,
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
  },
  business: {
    organizations: Infinity,
    members: Infinity,
    entriesPerMonth: Infinity,
    currencies: Infinity,
    contacts: Infinity,
    invoicesPerMonth: Infinity,
    bankAccounts: Infinity,
    projects: Infinity,
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
      "budget-vs-actual",
      "custom",
    ] as string[],
    storageMb: 51200,
    apiAccess: true,
    auditLogDays: Infinity,
  },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

export const PLAN_PRICES = {
  free: 0,
  pro: 12,
  business: 29,
} as const;

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
  "manage:projects": "member",
  "manage:teams": "admin",
  "manage:assets": "admin",
  "manage:budgets": "admin",
  "manage:credit-notes": "member",
  "manage:debit-notes": "member",
  "manage:payments": "member",
  "manage:recurring": "admin",
  "manage:period-lock": "owner",
  "manage:bank-rules": "admin",
  "manage:cost-centers": "admin",
  "view:audit-log": "admin",
  "invite:members": "admin",
  "change:roles": "admin",
  "remove:members": "admin",
  "manage:api-keys": "admin",
  "manage:billing": "owner",
  "delete:organization": "owner",
};

export function hasPermission(
  role: MemberRole,
  permission: string
): boolean {
  const required = PERMISSION_REQUIREMENTS[permission];
  if (!required) return false;
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[required];
}

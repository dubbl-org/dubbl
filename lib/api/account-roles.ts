import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { chartAccount, organization } from "@/lib/db/schema";
import { GENERIC_ACCOUNTS, getChartTemplate } from "@/lib/db/chart-templates";
import type { AccountKind, AccountTemplate, ChartTemplate } from "@/lib/db/chart-templates/types";
import { UNIVERSAL_ACCOUNTS } from "@/lib/db/chart-templates/universal";

/**
 * Account roles
 * =============
 * The posting engine speaks in canonical generic codes — an invoice debits
 * "1200" (receivables) and credits "2200" (output tax) — while each org's
 * chart can number those accounts however its country (or Xero) does: 610 and
 * 820 in a Xero-style UK chart, 411 and 4457 under the French PCG.
 *
 * Role-mapped charts (organization.chartTemplate set) store the canonical
 * codes an account stands in for on `chart_account.roles`. Looking up a
 * canonical code then means "the account playing that role", with the plain
 * code match kept only for accounts outside any template (legacy charts,
 * where roles is null everywhere, behave exactly as before).
 *
 * Non-canonical codes — "610", "4457", anything a user typed — are always
 * matched literally.
 */

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Codes the engine (and integrations) refer to by role. */
export const CANONICAL_CODES: ReadonlySet<string> = new Set([
  ...GENERIC_ACCOUNTS.map((a) => a.code),
  ...UNIVERSAL_ACCOUNTS.map((a) => a.code),
  "1660", // construction in progress / CWIP
  "3900", // currency translation reserve (consolidation CTA)
]);

export function isCanonicalCode(code: string): boolean {
  return CANONICAL_CODES.has(code);
}

/**
 * WHERE fragment for "the account that answers `code`". Combine with the
 * organization filter. For canonical codes this matches the role holder, or a
 * same-coded account that isn't part of a role-mapped chart.
 */
export function accountCodeMatch(code: string): SQL {
  if (!isCanonicalCode(code)) return eq(chartAccount.code, code);
  return or(
    sql`${code} = any(${chartAccount.roles})`,
    and(eq(chartAccount.code, code), isNull(chartAccount.roles)),
  )!;
}

/** ORDER BY fragment: role holders first, live accounts before archived ones. */
export function accountCodeRank(code: string): SQL {
  return sql`(case when ${code} = any(coalesce(${chartAccount.roles}, '{}'::text[])) then 0 else 1 end), (${chartAccount.deletedAt} is not null)`;
}

/** Find the org's account for a code (role-aware for canonical codes). */
export async function findAccountForCode(organizationId: string, code: string, exec: DbOrTx = db) {
  return exec.query.chartAccount.findFirst({
    where: and(eq(chartAccount.organizationId, organizationId), accountCodeMatch(code)),
    orderBy: [accountCodeRank(code)],
  });
}

/** In-memory version for callers that already loaded the chart. */
export function matchesCode(account: { code: string; roles?: string[] | null }, code: string): boolean {
  if (!isCanonicalCode(code)) return account.code === code;
  if (account.roles?.includes(code)) return true;
  return account.code === code && account.roles == null;
}

/** The org's role-mapped chart template, or null for a legacy chart. */
export async function getOrgChartTemplate(organizationId: string, exec: DbOrTx = db): Promise<ChartTemplate | null> {
  const [org] = await exec
    .select({ chartTemplate: organization.chartTemplate })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return getChartTemplate(org?.chartTemplate);
}

/** Next code after `code` (same width), e.g. "640" → "641", "1.1.20" → "1.1.21". */
export function bumpCode(code: string): string {
  const m = /^(.*?)(\d+)$/.exec(code);
  if (!m) return `${code}-1`;
  const n = String(Number(m[2]) + 1).padStart(m[2].length, "0");
  return `${m[1]}${n}`;
}

/** First code at or after `start` that isn't in `taken`. */
export function nextFreeLocalCode(start: string, taken: ReadonlySet<string>): string {
  let code = start;
  for (let i = 0; i < 2000 && taken.has(code); i++) code = bumpCode(code);
  return code;
}

/**
 * The template's own account for a canonical role — the seeded account first,
 * then the on-demand one. Null when the template doesn't place the role.
 */
export function templateAccountForRole(tpl: ChartTemplate, role: string): AccountTemplate | null {
  return (
    tpl.accounts.find((a) => a.roles?.includes(role)) ??
    tpl.onDemand.find((a) => a.roles?.includes(role)) ??
    null
  );
}

/**
 * Resolve the local account definition for a canonical role in a template:
 * the template's own placement when it has one, else a free code in the
 * right numbering range named after the engine's default.
 */
export function localDefinitionForRole(
  tpl: ChartTemplate,
  def: { code: string; name: string; type: AccountKind; subType?: string },
  taken: ReadonlySet<string>,
): AccountTemplate {
  const own = templateAccountForRole(tpl, def.code);
  if (own) {
    const code = taken.has(own.code) ? nextFreeLocalCode(bumpCode(own.code), taken) : own.code;
    return { ...own, code, roles: own.roles };
  }
  return {
    code: nextFreeLocalCode(tpl.fallbackStart[def.type], taken),
    name: def.name,
    type: def.type,
    subType: def.subType ?? "current",
    roles: [def.code],
  };
}

/**
 * Find (or create on demand) the account for a code. On a role-mapped chart a
 * missing canonical role is created at the template's own code (e.g. "806
 * Goods Received Not Invoiced"), never as a stray generic 4-digit account.
 */
export async function ensureAccountForCode(
  organizationId: string,
  def: { code: string; name: string; type: AccountKind; subType?: string },
  baseCurrency: string,
  exec: DbOrTx = db,
) {
  const existing = await findAccountForCode(organizationId, def.code, exec);
  if (existing) return existing;

  const tpl = isCanonicalCode(def.code) ? await getOrgChartTemplate(organizationId, exec) : null;
  if (!tpl) {
    await exec
      .insert(chartAccount)
      .values({
        organizationId,
        code: def.code,
        name: def.name,
        type: def.type,
        subType: def.subType ?? "current",
        currencyCode: baseCurrency,
      })
      .onConflictDoNothing({ target: [chartAccount.organizationId, chartAccount.code] });
    return findAccountForCode(organizationId, def.code, exec);
  }

  const taken = new Set(
    (
      await exec
        .select({ code: chartAccount.code })
        .from(chartAccount)
        .where(eq(chartAccount.organizationId, organizationId))
    ).map((r) => r.code),
  );
  const local = localDefinitionForRole(tpl, def, taken);
  await exec
    .insert(chartAccount)
    .values({
      organizationId,
      code: local.code,
      name: local.name,
      type: local.type,
      subType: local.subType,
      currencyCode: baseCurrency,
      roles: local.roles?.length ? local.roles : [def.code],
      isSystem: true,
    })
    .onConflictDoNothing({ target: [chartAccount.organizationId, chartAccount.code] });
  return findAccountForCode(organizationId, def.code, exec);
}

/**
 * The canonical code revenue recognition defers into. Legacy charts have
 * always used 2300; role-mapped charts use the proper income-in-advance role
 * (2400 → e.g. 810 Income in Advance), since 2300 there means accruals.
 */
export async function deferredRevenueCode(organizationId: string, exec: DbOrTx = db): Promise<string> {
  return (await getOrgChartTemplate(organizationId, exec)) ? "2400" : "2300";
}

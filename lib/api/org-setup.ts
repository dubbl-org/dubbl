import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chartAccount, journalEntry, organization, taxRate } from "@/lib/db/schema";
import { notDeleted } from "@/lib/db/soft-delete";
import { chartTemplateForCountry, getChartTemplate, seededAccountsFor, type ChartTemplate } from "@/lib/db/chart-templates";
import { syncSystemAccounts } from "@/lib/db/system-accounts";
import { ensureTaxRatesSeeded } from "@/lib/api/tax-profiles";

/**
 * Organisation setup
 * ==================
 * What happens when an org tells us where it's based — the Xero-style "pick a
 * country and you're ready" step: the country's default chart (Xero-style
 * 3-digit codes, or the national chart), its standard tax rates, and each
 * account's default tax rate, so the first invoice already knows that 200
 * Sales carries 20% VAT and 404 Bank Fees is exempt.
 */

export class ChartTemplateError extends Error {
  status = 409;
}

async function hasJournalActivity(organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(journalEntry)
    .where(eq(journalEntry.organizationId, organizationId));
  return (row?.n ?? 0) > 0;
}

/**
 * Put an org on a role-mapped chart template. Only allowed before anything is
 * posted (a chart can't be swapped under existing balances). Default accounts
 * auto-created before setup (e.g. a generic chart synced while the org had no
 * country) are removed so the org doesn't end up with two charts; anything the
 * user created themselves is kept.
 */
export async function applyChartTemplate(organizationId: string, templateId: string): Promise<ChartTemplate> {
  const chart = getChartTemplate(templateId);
  if (!chart) throw new ChartTemplateError(`Unknown chart template "${templateId}"`);
  if (await hasJournalActivity(organizationId)) {
    throw new ChartTemplateError(
      "The chart of accounts template can only be changed before any transactions are posted.",
    );
  }

  const keep = new Set(seededAccountsFor(chart).map((a) => a.code));
  const stale = await db
    .select({ id: chartAccount.id, code: chartAccount.code, roles: chartAccount.roles })
    .from(chartAccount)
    .where(and(eq(chartAccount.organizationId, organizationId), eq(chartAccount.isSystem, true)));
  // Previous template's own rows (roles set) and legacy defaults (roles null)
  // alike — except rows already at a code the new chart uses with matching roles.
  const toRemove = stale.filter((a) => !(keep.has(a.code) && a.roles != null));
  for (const a of toRemove) {
    try {
      await db.delete(chartAccount).where(eq(chartAccount.id, a.id));
    } catch {
      // Still referenced (e.g. linked to a bank account): archive it under a
      // freed-up code so the new chart can use the original one.
      await db
        .update(chartAccount)
        .set({ deletedAt: new Date(), isSystem: false, roles: null, code: `${a.code}-old-${a.id.slice(0, 4)}` })
        .where(eq(chartAccount.id, a.id));
    }
  }

  await db
    .update(organization)
    .set({ chartTemplate: chart.id, updatedAt: new Date() })
    .where(eq(organization.id, organizationId));
  await syncSystemAccounts(organizationId);
  return chart;
}

/**
 * Point each template account at its default tax rate (standard / exempt /
 * no tax) — only where the account doesn't have one yet, so a user's choice
 * is never overwritten.
 */
export async function applyAccountTaxDefaults(
  organizationId: string,
  chart: ChartTemplate,
  opts: { registered?: boolean } = {},
): Promise<number> {
  const rates = await db.query.taxRate.findMany({
    where: and(eq(taxRate.organizationId, organizationId), notDeleted(taxRate.deletedAt)),
    columns: { id: true, kind: true, isDefault: true, rate: true },
  });
  if (!rates.length) return 0;
  const noTax = rates.find((r) => r.kind === "no_vat")?.id;
  const exempt = rates.find((r) => r.kind === "exempt")?.id ?? noTax;
  const standard =
    opts.registered === false
      ? noTax
      : (rates.find((r) => r.isDefault && r.kind !== "no_vat")?.id ??
        rates.find((r) => r.kind === "standard" && r.rate > 0)?.id);
  const pick = { standard, exempt, none: noTax } as const;

  let updated = 0;
  const groups = new Map<string, string[]>();
  for (const a of seededAccountsFor(chart)) {
    const id = a.tax ? pick[a.tax] : undefined;
    if (!id) continue;
    groups.set(id, [...(groups.get(id) ?? []), a.code]);
  }
  for (const [rateId, codes] of groups) {
    const rows = await db
      .update(chartAccount)
      .set({ defaultTaxRateId: rateId })
      .where(
        and(
          eq(chartAccount.organizationId, organizationId),
          inArray(chartAccount.code, codes),
          isNull(chartAccount.defaultTaxRateId),
          isNotNull(chartAccount.roles),
        ),
      )
      .returning({ id: chartAccount.id });
    updated += rows.length;
  }
  return updated;
}

export interface SetupResult {
  chartTemplate: string | null;
  taxRatesCreated: number;
  accountsWithDefaultTax: number;
}

/**
 * Everything the first "this is my country" save sets up. Idempotent: the
 * chart is only chosen while the org has none and no postings; tax rates and
 * account tax defaults only fill gaps. Tax seeding is best-effort.
 */
export async function setUpOrganization(
  organizationId: string,
  opts: { countryCode: string | null; chartTemplate?: string | null; registeredForTax?: boolean },
): Promise<SetupResult> {
  const [org] = await db
    .select({ chartTemplate: organization.chartTemplate, defaultCurrency: organization.defaultCurrency })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  let chart = getChartTemplate(org?.chartTemplate);
  if (!chart && !(await hasJournalActivity(organizationId))) {
    chart = await applyChartTemplate(
      organizationId,
      opts.chartTemplate ?? chartTemplateForCountry(opts.countryCode).id,
    );
  } else {
    await syncSystemAccounts(organizationId, {
      currencyCode: org?.defaultCurrency ?? "USD",
      countryCode: opts.countryCode ?? undefined,
    });
  }

  let taxRatesCreated = 0;
  let accountsWithDefaultTax = 0;
  const registered = opts.registeredForTax;
  try {
    const seeded = await ensureTaxRatesSeeded(organizationId, opts.countryCode, { registered });
    taxRatesCreated = seeded?.created.length ?? 0;
    if (chart) accountsWithDefaultTax = await applyAccountTaxDefaults(organizationId, chart, { registered });
  } catch {
    // non-fatal: rates also self-heal lazily on the tax-rates endpoint
  }

  return { chartTemplate: chart?.id ?? null, taxRatesCreated, accountsWithDefaultTax };
}

/**
 * Country tax profiles — now a view over the jurisdiction modules.
 *
 * The data (rates, control accounts, return boxes) lives in lib/tax/modules and
 * is served by lib/tax/registry.ts. This file keeps the shapes the API routes
 * and MCP tools already return, and owns the one mutating operation: seeding an
 * org's tax_rate rows from its module.
 *
 * All rates are basis points (2000 = 20.00%); recoverablePercent likewise.
 */
import { db } from "@/lib/db";
import { taxRate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import type { taxRate as taxRateTable } from "@/lib/db/schema";
import {
  getTaxModule,
  listTaxModules,
  resolveTaxModuleForOrg,
} from "@/lib/tax/registry";
import type { ModuleRate, TaxModule } from "@/lib/tax/types";

export { FORM_1099_NEC_THRESHOLD_CENTS, build1099Report } from "@/lib/api/reports/1099";
export type { Report1099, Vendor1099Summary } from "@/lib/api/reports/1099";

export type ProfileRate = ModuleRate;

export interface ProfileReturnBox {
  box: string;
  label: string;
}

export interface ProfileControlAccounts {
  output: string;
  input?: string;
  suspense?: string;
}

export interface CountryTaxProfile {
  country: string;
  countryName: string;
  regime: "vat" | "gst" | "us_sales_tax";
  taxName: string;
  rates: ProfileRate[];
  returnBoxes: ProfileReturnBox[];
  controlAccounts: ProfileControlAccounts;
}

/** The module's primary return as the flat box list callers expect. */
function primaryBoxes(module: TaxModule): ProfileReturnBox[] {
  const primary = module.returns[0];
  if (!primary) return [];
  return primary.boxes.map((b) => ({ box: b.box, label: b.label }));
}

function toProfile(module: TaxModule): CountryTaxProfile {
  return {
    country: module.country,
    countryName: module.countryName,
    regime: module.regime,
    taxName: module.taxName,
    rates: module.rates,
    returnBoxes: primaryBoxes(module),
    controlAccounts: module.controlAccounts,
  };
}

/** All available profiles, keyed by ISO country code. */
export const COUNTRY_TAX_PROFILES: Record<string, CountryTaxProfile> = Object.fromEntries(
  listTaxModules().map((m) => [m.country, toProfile(m)])
);

export function listTaxProfiles(): CountryTaxProfile[] {
  return Object.values(COUNTRY_TAX_PROFILES);
}

export function getTaxProfileByCountry(
  country: string | null | undefined
): CountryTaxProfile | null {
  const module = getTaxModule(country);
  return module ? toProfile(module) : null;
}

/**
 * The profile that best fits an org: an explicit country, else the org's own
 * country, else the default country for its tax regime. Null when nothing
 * resolves to a known profile.
 */
export async function resolveProfileForOrg(
  organizationId: string,
  country?: string | null
): Promise<CountryTaxProfile | null> {
  if (country) {
    const explicit = getTaxProfileByCountry(country);
    if (explicit) return explicit;
  }
  // resolveTaxModuleForOrg falls back to GB rather than null; only report a
  // profile when the org actually resolved to something.
  const module = await resolveTaxModuleForOrg(organizationId, country);
  return toProfile(module);
}

export interface ApplyProfileResult {
  country: string;
  regime: "vat" | "gst" | "us_sales_tax";
  taxName: string;
  created: (typeof taxRateTable.$inferSelect)[];
  skipped: { name: string; rate: number; reason: string }[];
}

/**
 * Seed the org's tax rates from a country profile. A rate is skipped (never
 * duplicated) when an active rate with the same (name, rate, type, kind) already
 * exists. The default flag is only set when the org has no default yet, so
 * applying a profile never silently changes an org's chosen default.
 *
 * Writes `supplyCategory` and the effective window, which is what makes zero
 * rated, exempt and the 8% → 9% GST change auditable. Does not touch the
 * organization row or the chart of accounts.
 */
export async function applyTaxProfile(
  organizationId: string,
  profile: CountryTaxProfile
): Promise<ApplyProfileResult> {
  const existing = await db.query.taxRate.findMany({
    where: and(eq(taxRate.organizationId, organizationId), notDeleted(taxRate.deletedAt)),
    columns: { name: true, rate: true, type: true, kind: true, isDefault: true },
  });

  const key = (r: { name: string; rate: number; type: string; kind: string }) =>
    `${r.name.trim().toLowerCase()}|${r.rate}|${r.type}|${r.kind}`;
  const existingKeys = new Set(existing.map(key));
  const orgHasDefault = existing.some((r) => r.isDefault);

  const created: (typeof taxRateTable.$inferSelect)[] = [];
  const skipped: { name: string; rate: number; reason: string }[] = [];

  for (const r of profile.rates) {
    if (existingKeys.has(key(r))) {
      skipped.push({ name: r.name, rate: r.rate, reason: "already exists" });
      continue;
    }
    const isDefault = !!r.isDefault && !orgHasDefault;
    const [row] = await db
      .insert(taxRate)
      .values({
        organizationId,
        name: r.name,
        rate: r.rate,
        type: r.type,
        kind: r.kind,
        supplyCategory: r.supplyCategory ?? null,
        effectiveFrom: r.effectiveFrom ?? null,
        effectiveTo: r.effectiveTo ?? null,
        recoverablePercent: r.recoverablePercent,
        isDefault,
      })
      .returning();
    created.push(row);
    existingKeys.add(key(r));
  }

  return {
    country: profile.country,
    regime: profile.regime,
    taxName: profile.taxName,
    created,
    skipped,
  };
}

/**
 * Ensure an org has its standard tax rates. Idempotent, so it is safe both at
 * onboarding and lazily on read (the chart of accounts self-heals the same way).
 */
export async function ensureTaxRatesSeeded(
  organizationId: string,
  country?: string | null
): Promise<ApplyProfileResult | null> {
  const profile = await resolveProfileForOrg(organizationId, country);
  if (!profile) return null;
  return applyTaxProfile(organizationId, profile);
}

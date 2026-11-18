/**
 * Tax module registry.
 *
 * `countryCode` is the module key (never `organization.taxRegime`, which is free
 * text). Resolution order: explicit country → the org's own country → the
 * regime's default country → GB.
 */
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { ReturnDefinition, TaxModule } from "@/lib/tax/types";
import { EU_VAT_MODULES, GB_MODULE } from "@/lib/tax/modules/eu-vat";
import { US_MODULE } from "@/lib/tax/modules/us-sales";
import { SG_MODULE } from "@/lib/tax/modules/sg";

const MODULES: TaxModule[] = [...EU_VAT_MODULES, US_MODULE, SG_MODULE];

const BY_COUNTRY: Record<string, TaxModule> = Object.fromEntries(
  MODULES.map((m) => [m.country, m])
);

/** Regime → the country whose module is the default for that regime. */
const REGIME_DEFAULT_COUNTRY: Record<string, string> = {
  vat: "GB",
  gst: "AU",
  us_sales_tax: "US",
};

export function listTaxModules(): TaxModule[] {
  return MODULES;
}

export function getTaxModule(country: string | null | undefined): TaxModule | null {
  if (!country) return null;
  return BY_COUNTRY[country.trim().toUpperCase()] ?? null;
}

/** The module's return by kind, or null when that kind is not in the module. */
export function getReturnDefinition(
  module: TaxModule,
  kind: string
): ReturnDefinition | null {
  return module.returns.find((r) => r.kind === kind) ?? null;
}

/**
 * The module that fits an org. An explicit country wins; then the org's country
 * code; then the default country of its tax regime; finally GB so a return can
 * always be produced.
 */
export async function resolveTaxModuleForOrg(
  organizationId: string,
  country?: string | null
): Promise<TaxModule> {
  const explicit = getTaxModule(country);
  if (explicit) return explicit;

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { taxRegime: true, countryCode: true, country: true },
  });

  const byCountry = getTaxModule(org?.countryCode ?? org?.country);
  if (byCountry) return byCountry;

  const byRegime = getTaxModule(org?.taxRegime ? REGIME_DEFAULT_COUNTRY[org.taxRegime] : null);
  return byRegime ?? GB_MODULE;
}

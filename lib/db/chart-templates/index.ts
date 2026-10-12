import type { AccountTemplate, ChartTemplate } from "./types";
import { GENERIC_ACCOUNTS } from "./generic";
import { FR_ACCOUNTS } from "./fr";
import { ES_ACCOUNTS } from "./es";
import { DE_ACCOUNTS } from "./de";
import { SE_ACCOUNTS } from "./se";
import { BR_ACCOUNTS } from "./br";
import { BE_ACCOUNTS } from "./be";
import { AT_ACCOUNTS } from "./at";
import { IT_ACCOUNTS } from "./it";
import { PT_ACCOUNTS } from "./pt";
import { XERO_TEMPLATES } from "./xero";
import { NATIONAL_TEMPLATES } from "./national";
import { getCountrySetup } from "@/lib/country-setup";
import { UNIVERSAL_ACCOUNTS } from "./universal";

/**
 * Maps country codes to their legally mandated or de facto standard
 * chart of accounts templates.
 *
 * Countries not listed here will use the generic template.
 *
 * LEGACY: this is what orgs created before chart templates existed
 * (organization.chartTemplate = null) keep syncing against. New orgs get a
 * role-mapped ChartTemplate instead — see CHART_TEMPLATES below.
 */
const COUNTRY_TEMPLATES: Record<string, AccountTemplate[]> = {
  // Legally mandated
  FR: FR_ACCOUNTS, // Plan Comptable General (PCG)
  ES: ES_ACCOUNTS, // Plan General de Contabilidad (PGC)
  BE: BE_ACCOUNTS, // Plan Comptable Minimum Normalise (PCMN)
  BR: BR_ACCOUNTS, // CFC/ITG 1000 / SPED
  IT: IT_ACCOUNTS, // Piano dei Conti
  PT: PT_ACCOUNTS, // SNC (Sistema de Normalizacao Contabilistica)
  // De facto standard
  DE: DE_ACCOUNTS, // SKR03
  AT: AT_ACCOUNTS, // Einheitskontenrahmen (EKR)
  SE: SE_ACCOUNTS, // BAS
};

export function getAccountsForCountry(countryCode: string): AccountTemplate[] {
  return COUNTRY_TEMPLATES[countryCode] || GENERIC_ACCOUNTS;
}

/** Every role-mapped default chart, by id (the value of organization.chartTemplate). */
export const CHART_TEMPLATES: Record<string, ChartTemplate> = Object.fromEntries(
  [...XERO_TEMPLATES, ...NATIONAL_TEMPLATES].map((t) => [t.id, t]),
);

export function getChartTemplate(id: string | null | undefined): ChartTemplate | null {
  return id ? (CHART_TEMPLATES[id] ?? null) : null;
}

/** The default chart a new org in this country is set up with. */
export function chartTemplateForCountry(countryCode: string | null | undefined): ChartTemplate {
  return CHART_TEMPLATES[getCountrySetup(countryCode).chartTemplate] ?? CHART_TEMPLATES["xero-global"];
}

/**
 * The accounts a role-mapped chart starts with: the template's own list plus
 * whichever universal owner/director categories it doesn't place itself
 * (taken from its on-demand set, or numbered into its fallback range).
 * Deterministic, so every sync computes the same codes.
 */
export function seededAccountsFor(chart: ChartTemplate): AccountTemplate[] {
  const seeded = [...chart.accounts];
  const codes = new Set([...chart.accounts, ...chart.onDemand].map((a) => a.code));
  for (const u of UNIVERSAL_ACCOUNTS) {
    if (seeded.some((a) => a.roles?.includes(u.code))) continue;
    const own = chart.onDemand.find((a) => a.roles?.includes(u.code));
    if (own) {
      seeded.push(own);
      continue;
    }
    let code = chart.fallbackStart[u.type];
    while (codes.has(code)) code = bump(code);
    codes.add(code);
    seeded.push({ ...u, code, roles: [u.code] });
  }
  // Then everything a business needs from day one — expense claims, credit
  // card, accruals, petty cash, bad debts, the tax-return clearing account… —
  // taken from the template's on-demand set where the chart doesn't ship it.
  for (const role of DAY_ONE_ROLES) {
    if (seeded.some((a) => a.roles?.includes(role))) continue;
    const own = chart.onDemand.find((a) => a.roles?.includes(role));
    if (own && !seeded.includes(own)) seeded.push(own);
  }
  return seeded;
}

/**
 * Roles every org should see in its chart from the start (not only once the
 * engine first needs them). Input tax (1500) is left out: charts without a
 * recoverable purchase tax — US sales tax — rightly don't have one.
 */
const DAY_ONE_ROLES = [
  "1010", "1250", "1300", "1400", "1700", "2110", "2200", "2235", "2240", "2245", "2300",
  "2310", "2400", "2600", "2700", "3000", "4910", "5110", "5120", "5930", "6500", "8200",
];

function bump(code: string): string {
  const m = /^(.*?)(\d+)$/.exec(code);
  if (!m) return `${code}-1`;
  return `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, "0")}`;
}

export { GENERIC_ACCOUNTS };
export type { AccountTemplate, ChartTemplate };

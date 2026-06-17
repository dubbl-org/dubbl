import { db } from "@/lib/db";
import { taxRate, organization, payment, contact } from "@/lib/db/schema";
import { eq, and, ne, gte, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import type { taxRate as taxRateTable } from "@/lib/db/schema";

/**
 * Country tax profiles
 * ====================
 * Declarative per-country tax setups (default rate set, rate kinds, return
 * boxes, and which GL control accounts apply), so an org can adopt a sensible,
 * compliant starting point for VAT/GST/sales tax with one action instead of
 * hand-building every rate.
 *
 * All rates are in BASIS POINTS (2000 = 20.00%); recoverablePercent is also in
 * basis points (10000 = 100%). The `kind`/`type` mirror the taxRate schema
 * (lib/db/schema/bookkeeping.ts). Control-account codes match the system
 * control accounts created on demand by lib/api/journal-automation.ts:
 *   • outputVat 2200 — output VAT/GST collected on sales (liability)
 *   • inputVat  1500 — input VAT/GST reclaimable on purchases (asset)
 *   • salesTaxPayable 2230 — US sales tax collected (liability)
 *   • vatSuspense 2240 — VAT return clearing
 *
 * Profiles are keyed by org.taxRegime (vat | gst | us_sales_tax) where it makes
 * sense, but selection is by an explicit two-letter ISO country code so the same
 * regime (e.g. VAT) can carry country-specific rates and return boxes.
 */

/** A tax rate to seed for the org from a profile. */
export interface ProfileRate {
  /** Display name, e.g. "Standard Rate (20%)". */
  name: string;
  /** Rate in basis points (2000 = 20%). */
  rate: number;
  /** Whether the rate applies to sales, purchases, or both. */
  type: "sales" | "purchase" | "both";
  /** Posting/recovery behaviour — see taxRateKindEnum. */
  kind:
    | "standard"
    | "blocked"
    | "partial_block"
    | "exempt"
    | "reverse_charge"
    | "no_vat"
    | "sales_tax_us";
  /** Share of input tax recoverable, in basis points (10000 = 100%). */
  recoverablePercent: number;
  /** Marks the org default rate (at most one per profile). */
  isDefault?: boolean;
}

/** A single box/line on the country's periodic tax return. */
export interface ProfileReturnBox {
  /** Box number/identifier as it appears on the official return (e.g. "1", "G1"). */
  box: string;
  /** Human label. */
  label: string;
}

/** The control accounts (by stable chart code) a profile posts to. */
export interface ProfileControlAccounts {
  /** Output VAT/GST or sales tax collected — liability. */
  output: string;
  /** Input VAT/GST reclaimable — asset (omitted for non-recoverable regimes). */
  input?: string;
  /** Return clearing / suspense account. */
  suspense?: string;
}

export interface CountryTaxProfile {
  /** Two-letter ISO country code (uppercase). */
  country: string;
  /** Display name of the country. */
  countryName: string;
  /** The regime this profile implements (maps to organization.taxRegime). */
  regime: "vat" | "gst" | "us_sales_tax";
  /** Name of the tax as locally known, e.g. "VAT", "GST", "Sales Tax". */
  taxName: string;
  /** The default set of rates to seed. */
  rates: ProfileRate[];
  /** The periodic return's boxes/fields. */
  returnBoxes: ProfileReturnBox[];
  /** Which GL control accounts this regime uses. */
  controlAccounts: ProfileControlAccounts;
}

const VAT_CONTROL: ProfileControlAccounts = {
  output: "2200",
  input: "1500",
  suspense: "2240",
};

const GST_CONTROL: ProfileControlAccounts = {
  output: "2200",
  input: "1500",
  suspense: "2240",
};

// US sales tax is collected on sales (liability) but is NOT recoverable on
// purchases — there is no input-tax asset account.
const US_SALES_CONTROL: ProfileControlAccounts = {
  output: "2230",
};

/**
 * The country tax profiles, keyed by uppercase ISO country code.
 * Covers: US, GB, ZA, AU, CA, IE, IN, NL.
 */
export const COUNTRY_TAX_PROFILES: Record<string, CountryTaxProfile> = {
  US: {
    country: "US",
    countryName: "United States",
    regime: "us_sales_tax",
    taxName: "Sales Tax",
    rates: [
      // US sales tax rates are jurisdiction-specific; seed a generic placeholder
      // and a tax-free rate. Orgs refine via tax jurisdictions / lookup.
      { name: "Sales Tax", rate: 0, type: "both", kind: "sales_tax_us", recoverablePercent: 0, isDefault: true },
      { name: "Tax Exempt", rate: 0, type: "both", kind: "exempt", recoverablePercent: 0 },
      { name: "No Tax", rate: 0, type: "both", kind: "no_vat", recoverablePercent: 0 },
    ],
    returnBoxes: [
      { box: "gross_sales", label: "Gross Sales" },
      { box: "taxable_sales", label: "Taxable Sales" },
      { box: "tax_due", label: "Sales Tax Due" },
    ],
    controlAccounts: US_SALES_CONTROL,
  },
  GB: {
    country: "GB",
    countryName: "United Kingdom",
    regime: "vat",
    taxName: "VAT",
    rates: [
      { name: "Standard Rate (20%)", rate: 2000, type: "both", kind: "standard", recoverablePercent: 10000, isDefault: true },
      { name: "Reduced Rate (5%)", rate: 500, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "Zero Rate (0%)", rate: 0, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "Exempt", rate: 0, type: "both", kind: "exempt", recoverablePercent: 0 },
      { name: "Reverse Charge", rate: 2000, type: "purchase", kind: "reverse_charge", recoverablePercent: 10000 },
      { name: "No VAT", rate: 0, type: "both", kind: "no_vat", recoverablePercent: 0 },
    ],
    returnBoxes: [
      { box: "1", label: "VAT due on sales and other outputs" },
      { box: "2", label: "VAT due on acquisitions (NI)" },
      { box: "3", label: "Total VAT due (boxes 1 + 2)" },
      { box: "4", label: "VAT reclaimed on purchases and other inputs" },
      { box: "5", label: "Net VAT to pay/reclaim (box 3 − box 4)" },
      { box: "6", label: "Total value of sales excluding VAT" },
      { box: "7", label: "Total value of purchases excluding VAT" },
    ],
    controlAccounts: VAT_CONTROL,
  },
  ZA: {
    country: "ZA",
    countryName: "South Africa",
    regime: "vat",
    taxName: "VAT",
    rates: [
      { name: "Standard Rate (15%)", rate: 1500, type: "both", kind: "standard", recoverablePercent: 10000, isDefault: true },
      { name: "Zero Rate (0%)", rate: 0, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "Exempt", rate: 0, type: "both", kind: "exempt", recoverablePercent: 0 },
      { name: "No VAT", rate: 0, type: "both", kind: "no_vat", recoverablePercent: 0 },
    ],
    returnBoxes: [
      { box: "1", label: "Standard rated supplies (output VAT)" },
      { box: "4", label: "Total output tax" },
      { box: "14", label: "Total input tax" },
      { box: "20", label: "Net VAT payable / refundable" },
    ],
    controlAccounts: VAT_CONTROL,
  },
  AU: {
    country: "AU",
    countryName: "Australia",
    regime: "gst",
    taxName: "GST",
    rates: [
      { name: "GST (10%)", rate: 1000, type: "both", kind: "standard", recoverablePercent: 10000, isDefault: true },
      { name: "GST Free", rate: 0, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "Input Taxed", rate: 0, type: "both", kind: "exempt", recoverablePercent: 0 },
      { name: "No GST", rate: 0, type: "both", kind: "no_vat", recoverablePercent: 0 },
    ],
    returnBoxes: [
      { box: "G1", label: "Total sales (including GST)" },
      { box: "G10", label: "Capital purchases" },
      { box: "G11", label: "Non-capital purchases" },
      { box: "1A", label: "GST on sales" },
      { box: "1B", label: "GST on purchases" },
    ],
    controlAccounts: GST_CONTROL,
  },
  CA: {
    country: "CA",
    countryName: "Canada",
    regime: "gst",
    taxName: "GST/HST",
    rates: [
      { name: "GST (5%)", rate: 500, type: "both", kind: "standard", recoverablePercent: 10000, isDefault: true },
      { name: "HST (13%)", rate: 1300, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "HST (15%)", rate: 1500, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "Zero Rated", rate: 0, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "Exempt", rate: 0, type: "both", kind: "exempt", recoverablePercent: 0 },
      { name: "No GST", rate: 0, type: "both", kind: "no_vat", recoverablePercent: 0 },
    ],
    returnBoxes: [
      { box: "101", label: "Sales and other revenue" },
      { box: "103", label: "GST/HST collected" },
      { box: "106", label: "Input tax credits (ITCs)" },
      { box: "109", label: "Net tax" },
    ],
    controlAccounts: GST_CONTROL,
  },
  IE: {
    country: "IE",
    countryName: "Ireland",
    regime: "vat",
    taxName: "VAT",
    rates: [
      { name: "Standard Rate (23%)", rate: 2300, type: "both", kind: "standard", recoverablePercent: 10000, isDefault: true },
      { name: "Reduced Rate (13.5%)", rate: 1350, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "Second Reduced Rate (9%)", rate: 900, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "Zero Rate (0%)", rate: 0, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "Exempt", rate: 0, type: "both", kind: "exempt", recoverablePercent: 0 },
      { name: "Reverse Charge", rate: 2300, type: "purchase", kind: "reverse_charge", recoverablePercent: 10000 },
      { name: "No VAT", rate: 0, type: "both", kind: "no_vat", recoverablePercent: 0 },
    ],
    returnBoxes: [
      { box: "T1", label: "VAT on sales" },
      { box: "T2", label: "VAT on purchases" },
      { box: "T3", label: "Net payable (T1 − T2)" },
      { box: "T4", label: "Net repayable (T2 − T1)" },
    ],
    controlAccounts: VAT_CONTROL,
  },
  IN: {
    country: "IN",
    countryName: "India",
    regime: "gst",
    taxName: "GST",
    rates: [
      { name: "GST 18%", rate: 1800, type: "both", kind: "standard", recoverablePercent: 10000, isDefault: true },
      { name: "GST 28%", rate: 2800, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "GST 12%", rate: 1200, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "GST 5%", rate: 500, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "GST 0% (Nil rated)", rate: 0, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "Exempt", rate: 0, type: "both", kind: "exempt", recoverablePercent: 0 },
      { name: "Reverse Charge", rate: 1800, type: "purchase", kind: "reverse_charge", recoverablePercent: 10000 },
    ],
    returnBoxes: [
      { box: "3.1(a)", label: "Outward taxable supplies (output tax)" },
      { box: "4(A)", label: "Input tax credit available" },
      { box: "5", label: "Net tax payable" },
    ],
    controlAccounts: GST_CONTROL,
  },
  NL: {
    country: "NL",
    countryName: "Netherlands",
    regime: "vat",
    taxName: "BTW (VAT)",
    rates: [
      { name: "Standard Rate (21%)", rate: 2100, type: "both", kind: "standard", recoverablePercent: 10000, isDefault: true },
      { name: "Reduced Rate (9%)", rate: 900, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "Zero Rate (0%)", rate: 0, type: "both", kind: "standard", recoverablePercent: 10000 },
      { name: "Exempt", rate: 0, type: "both", kind: "exempt", recoverablePercent: 0 },
      { name: "Reverse Charge", rate: 2100, type: "purchase", kind: "reverse_charge", recoverablePercent: 10000 },
      { name: "No VAT", rate: 0, type: "both", kind: "no_vat", recoverablePercent: 0 },
    ],
    returnBoxes: [
      { box: "1a", label: "Supplies at standard rate (VAT)" },
      { box: "1b", label: "Supplies at reduced rate (VAT)" },
      { box: "5a", label: "Total output VAT" },
      { box: "5b", label: "Input VAT (voorbelasting)" },
      { box: "5c", label: "Net VAT payable / refundable" },
    ],
    controlAccounts: VAT_CONTROL,
  },
};

/** Map an organization.taxRegime value to the default country profile code. */
const REGIME_DEFAULT_COUNTRY: Record<string, string> = {
  vat: "GB",
  gst: "AU",
  us_sales_tax: "US",
};

/** All available profiles as a list (for listing endpoints/tools). */
export function listTaxProfiles(): CountryTaxProfile[] {
  return Object.values(COUNTRY_TAX_PROFILES);
}

/** Look up a profile by ISO country code (case-insensitive). Null if unknown. */
export function getTaxProfileByCountry(
  country: string | null | undefined
): CountryTaxProfile | null {
  if (!country) return null;
  return COUNTRY_TAX_PROFILES[country.trim().toUpperCase()] ?? null;
}

/**
 * Resolve the profile that best fits an org: prefer an explicit country code,
 * else fall back to the org's taxRegime → default country mapping. Returns null
 * when neither resolves to a known profile.
 */
export async function resolveProfileForOrg(
  organizationId: string,
  country?: string | null
): Promise<CountryTaxProfile | null> {
  const explicit = getTaxProfileByCountry(country);
  if (explicit) return explicit;

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
    columns: { taxRegime: true, countryCode: true, country: true },
  });

  // org.taxRegime drives the profile when present (per task spec).
  if (org?.taxRegime) {
    const byCountry = getTaxProfileByCountry(org.countryCode ?? org.country);
    if (byCountry && byCountry.regime === org.taxRegime) return byCountry;
    const fallbackCountry = REGIME_DEFAULT_COUNTRY[org.taxRegime];
    const byRegime = getTaxProfileByCountry(fallbackCountry);
    if (byRegime) return byRegime;
  }

  // Last resort: the org's stored country code, regardless of regime.
  return getTaxProfileByCountry(org?.countryCode ?? org?.country);
}

export interface ApplyProfileResult {
  country: string;
  regime: "vat" | "gst" | "us_sales_tax";
  taxName: string;
  created: (typeof taxRateTable.$inferSelect)[];
  skipped: { name: string; rate: number; reason: string }[];
}

/**
 * Seed the org's taxRate rows from a country profile. Idempotent-ish: a rate is
 * skipped (not duplicated) when an active rate with the same (name, rate, type,
 * kind) already exists for the org. When the profile marks a default rate and
 * the org has no default yet, the seeded default is honored; otherwise the
 * existing default is left untouched (we don't flip an org's chosen default).
 *
 * Does NOT modify the organization row or the chart of accounts — the profile's
 * control accounts are created on demand at posting time by journal-automation.
 * Returns the created rows plus a list of skipped rates with the reason.
 */
export async function applyTaxProfile(
  organizationId: string,
  profile: CountryTaxProfile
): Promise<ApplyProfileResult> {
  const existing = await db.query.taxRate.findMany({
    where: and(
      eq(taxRate.organizationId, organizationId),
      notDeleted(taxRate.deletedAt)
    ),
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
    // Only seed the default flag when the org currently has no default rate, so
    // applying a profile never silently changes an org's chosen default.
    const isDefault = !!r.isDefault && !orgHasDefault;
    const [row] = await db
      .insert(taxRate)
      .values({
        organizationId,
        name: r.name,
        rate: r.rate,
        type: r.type,
        kind: r.kind,
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
 * US 1099 reporting
 * =================
 * Aggregates reportable payments made to each 1099 vendor for a tax (calendar)
 * year. 1099-NEC/MISC reports payments on a CASH basis, so it sums the org's
 * actual `payment` records to suppliers (type='made') dated within the year —
 * NOT bill totals (accrual). Card payments are EXCLUDED: per IRS rules, card /
 * third-party-network payments are reported by the processor on 1099-K, so the
 * payer must not also report them on a 1099-NEC/MISC.
 *
 * Vendors are included when contact.is1099Vendor is true. All amounts are in
 * integer cents.
 */

/** The federal reporting threshold for 1099-NEC nonemployee compensation. */
export const FORM_1099_NEC_THRESHOLD_CENTS = 60000; // $600.00

export interface Vendor1099Summary {
  contactId: string;
  name: string;
  /** TIN/SSN/EIN as captured on the W-9 (contact.taxIdentifier). */
  taxIdentifier: string | null;
  /** W-9 federal tax classification (contact.w9TaxClassification). */
  w9TaxClassification: string | null;
  /** Subject to 24% backup withholding (contact.backupWithholding). */
  backupWithholding: boolean;
  /** Total reportable payments in the year (cents), excluding card payments. */
  totalPaid: number;
  /** Number of payments that made up totalPaid. */
  paymentCount: number;
  /** True when totalPaid meets/exceeds the $600 1099-NEC reporting threshold. */
  reportable: boolean;
}

export interface Report1099 {
  taxYear: number;
  startDate: string;
  endDate: string;
  /** Reporting threshold applied (cents). */
  threshold: number;
  /** Per-vendor summaries (sorted by totalPaid descending). */
  vendors: Vendor1099Summary[];
  /** Vendors at or above the threshold (a 1099 must be filed for these). */
  reportableCount: number;
  /** Grand total of reportable (>= threshold) vendor payments, in cents. */
  reportableTotal: number;
  /** Grand total across all 1099 vendors regardless of threshold, in cents. */
  grandTotal: number;
}

/**
 * Build the 1099 summary for a calendar tax year. Sums non-card supplier
 * payments per 1099 vendor and flags those at/above the $600 threshold.
 *
 * @param taxYear four-digit calendar year (e.g. 2025)
 * @param thresholdCents override the $600 reporting threshold (cents)
 */
export async function build1099Report(
  organizationId: string,
  taxYear: number,
  thresholdCents: number = FORM_1099_NEC_THRESHOLD_CENTS
): Promise<Report1099> {
  const startDate = `${taxYear}-01-01`;
  const endDate = `${taxYear}-12-31`;

  // All 1099 vendors for the org (a vendor with zero payments still appears with
  // a 0 total so the user can see who is flagged but unpaid).
  const vendors = await db.query.contact.findMany({
    where: and(
      eq(contact.organizationId, organizationId),
      eq(contact.is1099Vendor, true),
      notDeleted(contact.deletedAt)
    ),
    columns: {
      id: true,
      name: true,
      taxIdentifier: true,
      w9TaxClassification: true,
      backupWithholding: true,
    },
  });

  // Supplier payments in the year, excluding card payments (reported on 1099-K
  // by the processor) and soft-deleted payments.
  const payments = await db.query.payment.findMany({
    where: and(
      eq(payment.organizationId, organizationId),
      eq(payment.type, "made"),
      ne(payment.method, "card"),
      gte(payment.date, startDate),
      lte(payment.date, endDate),
      notDeleted(payment.deletedAt)
    ),
    columns: { contactId: true, amount: true },
  });

  const totals = new Map<string, { total: number; count: number }>();
  for (const p of payments) {
    const cur = totals.get(p.contactId) ?? { total: 0, count: 0 };
    cur.total += p.amount;
    cur.count += 1;
    totals.set(p.contactId, cur);
  }

  const summaries: Vendor1099Summary[] = vendors.map((v) => {
    const agg = totals.get(v.id) ?? { total: 0, count: 0 };
    return {
      contactId: v.id,
      name: v.name,
      taxIdentifier: v.taxIdentifier ?? null,
      w9TaxClassification: v.w9TaxClassification ?? null,
      backupWithholding: v.backupWithholding,
      totalPaid: agg.total,
      paymentCount: agg.count,
      reportable: agg.total >= thresholdCents,
    };
  });

  summaries.sort((a, b) => b.totalPaid - a.totalPaid);

  const reportable = summaries.filter((s) => s.reportable);

  return {
    taxYear,
    startDate,
    endDate,
    threshold: thresholdCents,
    vendors: summaries,
    reportableCount: reportable.length,
    reportableTotal: reportable.reduce((s, v) => s + v.totalPaid, 0),
    grandTotal: summaries.reduce((s, v) => s + v.totalPaid, 0),
  };
}

/**
 * Country setup defaults
 * ======================
 * Everything a new organisation can infer from "where is your business
 * based?", so setup is as short as Xero's: which default chart it gets, what
 * the sales tax is called locally, whether it's a VAT/GST or US sales-tax
 * regime, when the financial year usually starts, and what the tax number is
 * called on invoices. Pure data (no DB import) so the onboarding UI can use it.
 */

export type TaxRegime = "vat" | "gst" | "us_sales_tax";

export interface CountrySetup {
  /** ISO 3166-1 alpha-2. */
  code: string;
  /** What the tax is called locally, e.g. "VAT", "GST", "TVA", "Sales Tax". */
  taxName: string;
  /** The tax regime, or null where dubbl ships no standard rates (e.g. HK). */
  regime: TaxRegime | null;
  /** Month the financial year usually starts (1 = January). */
  fiscalYearStartMonth: number;
  /** Label for the business tax number. */
  taxIdLabel: string;
  /** Example of the tax number's format. */
  taxIdPlaceholder?: string;
  /** Whether a cash-accounting VAT/GST scheme is available. */
  cashScheme?: boolean;
  /** The default chart of accounts (see lib/db/chart-templates). */
  chartTemplate: string;
}

const C = (
  code: string,
  taxName: string,
  regime: TaxRegime | null,
  fiscalYearStartMonth: number,
  chartTemplate: string,
  taxIdLabel: string,
  taxIdPlaceholder?: string,
  cashScheme?: boolean,
): CountrySetup => ({ code, taxName, regime, fiscalYearStartMonth, chartTemplate, taxIdLabel, taxIdPlaceholder, cashScheme });

const VAT = "xero-global-vat";
const GST = "xero-global-gst";

const SETUPS: CountrySetup[] = [
  // North America
  C("US", "Sales Tax", "us_sales_tax", 1, "xero-us", "EIN", "12-3456789"),
  C("CA", "GST/HST", "gst", 1, GST, "Business Number (BN)", "123456789RT0001"),
  C("MX", "IVA", "vat", 1, VAT, "RFC", "XAXX010101000", true),
  // Europe
  C("GB", "VAT", "vat", 4, "xero-uk", "VAT registration number", "GB123456789", true),
  C("IE", "VAT", "vat", 1, VAT, "VAT number", "IE1234567T", true),
  C("DE", "USt", "vat", 1, "de", "USt-IdNr.", "DE123456789", true),
  C("AT", "USt", "vat", 1, "at", "UID-Nummer", "ATU12345678", true),
  C("FR", "TVA", "vat", 1, "fr", "N° TVA intracommunautaire", "FR12345678901", true),
  C("BE", "TVA / BTW", "vat", 1, "be", "Numéro de TVA / BTW-nummer", "BE0123456789"),
  C("NL", "BTW", "vat", 1, VAT, "BTW-identificatienummer", "NL123456789B01", true),
  C("ES", "IVA", "vat", 1, "es", "NIF / CIF", "ESB12345678", true),
  C("PT", "IVA", "vat", 1, "pt", "NIF", "PT123456789", true),
  C("IT", "IVA", "vat", 1, "it", "Partita IVA", "IT12345678901", true),
  C("SE", "Moms", "vat", 1, "se", "Momsregistreringsnummer", "SE123456789001", true),
  C("DK", "Moms", "vat", 1, VAT, "CVR-nummer", "DK12345678"),
  C("NO", "MVA", "vat", 1, VAT, "Organisasjonsnummer (MVA)", "NO123456789MVA"),
  C("FI", "ALV", "vat", 1, VAT, "ALV-numero", "FI12345678", true),
  C("PL", "VAT", "vat", 1, VAT, "NIP", "PL1234567890", true),
  C("CZ", "DPH", "vat", 1, VAT, "DIČ", "CZ12345678"),
  C("CH", "MWST / TVA", "vat", 1, VAT, "UID / MWST-Nr.", "CHE-123.456.789 MWST", true),
  // Asia-Pacific
  C("AU", "GST", "gst", 7, "xero-au", "ABN", "12 345 678 901", true),
  C("NZ", "GST", "gst", 4, "xero-nz", "GST number", "123-456-789", true),
  C("SG", "GST", "gst", 1, GST, "GST registration number", "M90312345A"),
  C("IN", "GST", "gst", 4, GST, "GSTIN", "22AAAAA0000A1Z5"),
  C("MY", "SST", null, 1, "xero-global", "SST registration number", "W10-1234-56789012"),
  C("JP", "Consumption Tax", "vat", 4, VAT, "Invoice registration number", "T1234567890123"),
  C("KR", "VAT", "vat", 1, VAT, "Business registration number", "123-45-67890"),
  C("CN", "VAT", "vat", 1, VAT, "Unified Social Credit Code", "91110000123456789X"),
  C("HK", "Sales Tax", null, 4, "xero-global", "Business Registration Number", "12345678"),
  C("TW", "Business Tax", "vat", 1, VAT, "Unified Business Number", "12345678"),
  C("TH", "VAT", "vat", 1, VAT, "Tax ID", "0105512345678"),
  C("ID", "PPN", "vat", 1, VAT, "NPWP", "01.234.567.8-912.000"),
  C("PH", "VAT", "vat", 1, VAT, "TIN", "123-456-789-000"),
  C("VN", "VAT", "vat", 1, VAT, "Tax code (MST)", "0123456789"),
  // South America
  C("BR", "ICMS / ISS", null, 1, "br", "CNPJ", "12.345.678/0001-90"),
  // Middle East & Africa
  C("AE", "VAT", "vat", 1, VAT, "TRN", "100123456700003"),
  C("SA", "VAT", "vat", 1, VAT, "VAT registration number", "300123456700003"),
  C("IL", "VAT", "vat", 1, VAT, "VAT / company number", "512345678"),
  C("ZA", "VAT", "vat", 3, VAT, "VAT number", "4123456789", true),
  C("NG", "VAT", "vat", 1, VAT, "TIN", "12345678-0001"),
  C("KE", "VAT", "vat", 1, VAT, "KRA PIN", "P051234567X"),
];

const BY_CODE = new Map(SETUPS.map((s) => [s.code, s]));

/** Defaults for countries not listed above: Xero's international chart, no rates. */
function fallback(code: string): CountrySetup {
  return C(code, "Sales Tax", null, 1, "xero-global", "Tax ID");
}

/** The setup defaults for a country (case-insensitive ISO code). */
export function getCountrySetup(countryCode: string | null | undefined): CountrySetup {
  const code = (countryCode ?? "").trim().toUpperCase();
  return BY_CODE.get(code) ?? fallback(code);
}

/** Every country with tailored defaults (for listing endpoints / MCP). */
export function listCountrySetups(): CountrySetup[] {
  return SETUPS;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "31 March" for a fiscal year that starts in April. */
export function fiscalYearEndLabel(startMonth: number): string {
  const endMonth = ((startMonth + 10) % 12) + 1; // the month before startMonth
  const lastDay = new Date(Date.UTC(2023, endMonth, 0)).getUTCDate();
  return `${lastDay} ${MONTH_NAMES[endMonth - 1]}`;
}

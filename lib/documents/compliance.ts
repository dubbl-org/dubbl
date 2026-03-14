export interface ComplianceWarning {
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface ComplianceOrg {
  name?: string | null;
  address?: string | null;
  taxId?: string | null;
  countryCode?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressPostalCode?: string | null;
  addressCountry?: string | null;
  businessRegistrationNumber?: string | null;
  legalEntityType?: string | null;
}

interface ComplianceContact {
  name?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  countryCode?: string | null;
}

interface ComplianceLineItem {
  description?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  taxAmount?: number | null;
}

interface ComplianceInvoice {
  invoiceNumber?: string | null;
  issueDate?: string | null;
  lines?: ComplianceLineItem[] | null;
  dueDate?: string | null;
  currencyCode?: string | null;
  notes?: string | null;
}

const EU_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

interface ComplianceRule {
  countries: string[] | "*";
  field: string;
  severity: "error" | "warning";
  message: string;
  condition?: (org: ComplianceOrg, contact: ComplianceContact, invoice: ComplianceInvoice) => boolean;
  check: (org: ComplianceOrg, contact: ComplianceContact, invoice: ComplianceInvoice) => boolean;
}

const rules: ComplianceRule[] = [
  // ── Universal ──
  {
    countries: "*",
    field: "org.name",
    severity: "error",
    message: "Organization name is required",
    check: (org) => !org.name,
  },
  {
    countries: "*",
    field: "invoice.invoiceNumber",
    severity: "error",
    message: "Invoice number is required",
    check: (_o, _c, inv) => !inv.invoiceNumber,
  },
  {
    countries: "*",
    field: "invoice.issueDate",
    severity: "error",
    message: "Issue date is required",
    check: (_o, _c, inv) => !inv.issueDate,
  },
  {
    countries: "*",
    field: "invoice.lines",
    severity: "error",
    message: "At least one line item is required",
    check: (_o, _c, inv) => !inv.lines || inv.lines.length === 0,
  },
  {
    countries: "*",
    field: "invoice.lines",
    severity: "warning",
    message: "Each line item should have a description, quantity, and unit price",
    condition: (_o, _c, inv) => !!inv.lines && inv.lines.length > 0,
    check: (_o, _c, inv) =>
      inv.lines!.some((l) => !l.description || l.quantity == null || l.unitPrice == null),
  },

  // ── EU (all 27) ──
  {
    countries: EU_COUNTRIES,
    field: "org.address",
    severity: "error",
    message: "Full organization address is required for EU invoices",
    check: (org) => !org.address && !org.addressStreet,
  },
  {
    countries: EU_COUNTRIES,
    field: "org.addressCity",
    severity: "warning",
    message: "Organization city is recommended for EU invoices",
    condition: (org) => !!org.addressStreet,
    check: (org) => !org.addressCity,
  },
  {
    countries: EU_COUNTRIES,
    field: "org.addressPostalCode",
    severity: "warning",
    message: "Organization postal code is recommended for EU invoices",
    condition: (org) => !!org.addressStreet,
    check: (org) => !org.addressPostalCode,
  },
  {
    countries: EU_COUNTRIES,
    field: "org.addressCountry",
    severity: "warning",
    message: "Organization country is recommended for EU invoices",
    condition: (org) => !!org.addressStreet,
    check: (org) => !org.addressCountry,
  },
  {
    countries: EU_COUNTRIES,
    field: "org.taxId",
    severity: "error",
    message: "VAT number is required for EU invoices",
    check: (org) => !org.taxId,
  },
  {
    countries: EU_COUNTRIES,
    field: "invoice.dueDate",
    severity: "warning",
    message: "Due date is required for EU invoices",
    check: (_o, _c, inv) => !inv.dueDate,
  },
  {
    countries: EU_COUNTRIES,
    field: "contact.name",
    severity: "warning",
    message: "Customer name is required for EU invoices",
    check: (_o, contact) => !contact.name,
  },
  {
    countries: EU_COUNTRIES,
    field: "invoice.currencyCode",
    severity: "warning",
    message: "Currency code is required for EU invoices",
    check: (_o, _c, inv) => !inv.currencyCode,
  },
  {
    countries: EU_COUNTRIES,
    field: "contact.taxNumber",
    severity: "warning",
    message: "Customer VAT number is required for B2B cross-border EU invoices",
    condition: (org, contact) =>
      !!contact.countryCode && !!org.countryCode && contact.countryCode !== org.countryCode,
    check: (_o, contact) => !contact.taxNumber,
  },
  {
    countries: EU_COUNTRIES,
    field: "invoice.notes",
    severity: "warning",
    message: "Reverse charge notice is required for B2B cross-border EU invoices",
    condition: (org, contact) =>
      !!contact.taxNumber &&
      !!contact.countryCode &&
      !!org.countryCode &&
      contact.countryCode !== org.countryCode,
    check: (_o, _c, inv) =>
      !inv.notes || !inv.notes.toLowerCase().includes("reverse charge"),
  },
  {
    countries: EU_COUNTRIES,
    field: "contact.address",
    severity: "warning",
    message: "Customer address is recommended for B2B EU invoices",
    condition: (_o, contact) => !!contact.taxNumber,
    check: (_o, contact) => !contact.address,
  },

  // ── UK (GB) - EU rules apply via EU_COUNTRIES check above, plus: ──
  {
    countries: ["GB"],
    field: "org.address",
    severity: "error",
    message: "Full organization address is required for UK invoices",
    check: (org) => !org.address && !org.addressStreet,
  },
  {
    countries: ["GB"],
    field: "org.taxId",
    severity: "error",
    message: "VAT number is required for UK invoices",
    check: (org) => !org.taxId,
  },
  {
    countries: ["GB"],
    field: "invoice.dueDate",
    severity: "warning",
    message: "Due date is required for UK invoices",
    check: (_o, _c, inv) => !inv.dueDate,
  },
  {
    countries: ["GB"],
    field: "contact.name",
    severity: "warning",
    message: "Customer name is required for UK invoices",
    check: (_o, contact) => !contact.name,
  },
  {
    countries: ["GB"],
    field: "invoice.currencyCode",
    severity: "warning",
    message: "Currency code is required for UK invoices",
    check: (_o, _c, inv) => !inv.currencyCode,
  },
  {
    countries: ["GB"],
    field: "contact.address",
    severity: "warning",
    message: "Customer address is recommended for B2B UK invoices",
    condition: (_o, contact) => !!contact.taxNumber,
    check: (_o, contact) => !contact.address,
  },

  // ── DE - Germany specific ──
  {
    countries: ["DE"],
    field: "org.taxId",
    severity: "error",
    message: "Steuernummer or USt-IdNr is required for German invoices",
    check: (org) => !org.taxId && !org.businessRegistrationNumber,
  },

  // ── FR - France specific ──
  {
    countries: ["FR"],
    field: "org.businessRegistrationNumber",
    severity: "warning",
    message: "SIREN/SIRET number is required for French invoices",
    check: (org) => !org.businessRegistrationNumber,
  },
  {
    countries: ["FR"],
    field: "invoice.notes",
    severity: "warning",
    message: "VAT exemption notice is required on French invoices when applicable",
    condition: (org) => !org.taxId,
    check: (_o, _c, inv) => !inv.notes || !inv.notes.toLowerCase().includes("tva"),
  },

  // ── IN - India ──
  {
    countries: ["IN"],
    field: "org.taxId",
    severity: "error",
    message: "GSTIN is required for Indian invoices",
    check: (org) => !org.taxId,
  },
  {
    countries: ["IN"],
    field: "org.address",
    severity: "error",
    message: "Organization address is required for Indian invoices",
    check: (org) => !org.address && !org.addressStreet,
  },
  {
    countries: ["IN"],
    field: "contact.address",
    severity: "warning",
    message: "Customer address is required for Indian invoices",
    check: (_o, contact) => !contact.address,
  },

  // ── SG - Singapore ──
  {
    countries: ["SG"],
    field: "org.taxId",
    severity: "warning",
    message: "GST registration number is recommended for Singaporean invoices",
    check: (org) => !org.taxId,
  },

  // ── SA - Saudi Arabia ──
  {
    countries: ["SA"],
    field: "org.taxId",
    severity: "error",
    message: "VAT registration number is required for Saudi invoices",
    check: (org) => !org.taxId,
  },
  {
    countries: ["SA"],
    field: "org.address",
    severity: "error",
    message: "Organization address is required for Saudi invoices",
    check: (org) => !org.address && !org.addressStreet,
  },

  // ── JP - Japan ──
  {
    countries: ["JP"],
    field: "org.taxId",
    severity: "warning",
    message: "Registration number is required for qualified Japanese invoices",
    check: (org) => !org.taxId,
  },
  {
    countries: ["JP"],
    field: "org.address",
    severity: "warning",
    message: "Organization address is recommended for Japanese invoices",
    check: (org) => !org.address && !org.addressStreet,
  },

  // ── BR - Brazil ──
  {
    countries: ["BR"],
    field: "org.taxId",
    severity: "error",
    message: "CNPJ is required for Brazilian invoices",
    check: (org) => !org.taxId,
  },
  {
    countries: ["BR"],
    field: "org.address",
    severity: "error",
    message: "Organization address is required for Brazilian invoices",
    check: (org) => !org.address && !org.addressStreet,
  },

  // ── AU - Australia ──
  {
    countries: ["AU"],
    field: "org.taxId",
    severity: "warning",
    message: "ABN is recommended for Australian invoices",
    check: (org) => !org.taxId,
  },
  {
    countries: ["AU"],
    field: "org.address",
    severity: "warning",
    message: "Organization address is recommended for Australian invoices",
    check: (org) => !org.address && !org.addressStreet,
  },

  // ── NZ - New Zealand ──
  {
    countries: ["NZ"],
    field: "org.taxId",
    severity: "warning",
    message: "GST number is recommended for New Zealand invoices",
    check: (org) => !org.taxId,
  },

  // ── CA - Canada ──
  {
    countries: ["CA"],
    field: "org.taxId",
    severity: "warning",
    message: "GST/HST number is recommended for Canadian invoices",
    check: (org) => !org.taxId,
  },

  // ── Fallback for all other countries (not US) ──
  {
    countries: "*",
    field: "org.address",
    severity: "warning",
    message: "Organization address is recommended",
    condition: (org) => {
      const c = org.countryCode?.toUpperCase();
      if (!c) return false;
      const covered = [
        ...EU_COUNTRIES, "GB", "IN", "SG", "SA", "JP", "BR", "AU", "NZ", "CA", "US",
      ];
      return !covered.includes(c);
    },
    check: (org) => !org.address && !org.addressStreet,
  },
  {
    countries: "*",
    field: "org.taxId",
    severity: "warning",
    message: "Tax ID is recommended",
    condition: (org) => {
      const c = org.countryCode?.toUpperCase();
      if (!c) return false;
      const covered = [
        ...EU_COUNTRIES, "GB", "DE", "FR", "IN", "SG", "SA", "JP", "BR", "AU", "NZ", "CA", "US",
      ];
      return !covered.includes(c);
    },
    check: (org) => !org.taxId,
  },
];

export function checkInvoiceCompliance(
  org: ComplianceOrg,
  contact: ComplianceContact,
  invoice: ComplianceInvoice
): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];
  const country = org.countryCode?.toUpperCase() ?? null;

  for (const rule of rules) {
    // Check if rule applies to this country
    if (rule.countries !== "*") {
      if (!country || !rule.countries.includes(country)) continue;
    }

    // Check optional condition
    if (rule.condition && !rule.condition(org, contact, invoice)) continue;

    // Run the check
    if (rule.check(org, contact, invoice)) {
      warnings.push({
        field: rule.field,
        message: rule.message,
        severity: rule.severity,
      });
    }
  }

  // Deduplicate by field+message
  const seen = new Set<string>();
  return warnings.filter((w) => {
    const key = `${w.field}:${w.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

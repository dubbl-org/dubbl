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
}

interface ComplianceContact {
  name?: string | null;
  address?: string | null;
  taxNumber?: string | null;
}

interface ComplianceInvoice {
  invoiceNumber?: string | null;
  issueDate?: string | null;
  lines?: unknown[] | null;
}

const EU_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

export function checkInvoiceCompliance(
  org: ComplianceOrg,
  contact: ComplianceContact,
  invoice: ComplianceInvoice
): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];

  // Universal requirements
  if (!org.name) {
    warnings.push({ field: "org.name", message: "Organization name is required", severity: "error" });
  }
  if (!invoice.invoiceNumber) {
    warnings.push({ field: "invoice.invoiceNumber", message: "Invoice number is required", severity: "error" });
  }
  if (!invoice.issueDate) {
    warnings.push({ field: "invoice.issueDate", message: "Issue date is required", severity: "error" });
  }
  if (!invoice.lines || invoice.lines.length === 0) {
    warnings.push({ field: "invoice.lines", message: "At least one line item is required", severity: "error" });
  }

  const country = org.countryCode?.toUpperCase();
  if (!country) return warnings;

  const isEU = EU_COUNTRIES.includes(country);
  const isUK = country === "GB";
  const isAU = country === "AU";
  const isNZ = country === "NZ";
  const isCA = country === "CA";
  const isUS = country === "US";

  if (isEU || isUK) {
    if (!org.address) {
      warnings.push({ field: "org.address", message: "Organization address is required for EU/UK invoices", severity: "error" });
    }
    if (!org.taxId) {
      warnings.push({ field: "org.taxId", message: "VAT number is required for EU/UK invoices", severity: "error" });
    }
    // B2B: if contact has a tax number, their address is expected
    if (contact.taxNumber && !contact.address) {
      warnings.push({ field: "contact.address", message: "Customer address is recommended for B2B EU/UK invoices", severity: "warning" });
    }
  } else if (isAU || isNZ) {
    if (!org.taxId) {
      warnings.push({ field: "org.taxId", message: `ABN is recommended for ${isAU ? "Australian" : "New Zealand"} invoices`, severity: "warning" });
    }
  } else if (isCA) {
    if (!org.taxId) {
      warnings.push({ field: "org.taxId", message: "GST/HST number is recommended for Canadian invoices", severity: "warning" });
    }
  } else if (!isUS) {
    // Fallback for other countries
    if (!org.address) {
      warnings.push({ field: "org.address", message: "Organization address is recommended", severity: "warning" });
    }
    if (!org.taxId) {
      warnings.push({ field: "org.taxId", message: "Tax ID is recommended", severity: "warning" });
    }
  }

  return warnings;
}

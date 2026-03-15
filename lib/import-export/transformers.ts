import type { SourceSystem } from "./types";

/**
 * Parse a money string to integer cents.
 * Handles "1,234.56", "1234.56", "1.234,56" (European), negative with - or ()
 */
export function parseMoney(value: string): number {
  if (!value || value.trim() === "") return 0;
  let cleaned = value.trim();

  // Handle parentheses for negative
  const isNeg = cleaned.startsWith("(") && cleaned.endsWith(")");
  if (isNeg) cleaned = cleaned.slice(1, -1);

  // Remove currency symbols
  cleaned = cleaned.replace(/[$€£¥]/g, "");

  // Detect European format: "1.234,56" (dot as thousands, comma as decimal)
  if (/\d+\.\d{3},\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    // Standard format: remove commas as thousands separators
    cleaned = cleaned.replace(/,/g, "");
  }

  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;

  const cents = Math.round(num * 100);
  return isNeg ? -cents : cents;
}

/**
 * Normalize date strings to YYYY-MM-DD format.
 */
export function parseDate(value: string, _source: SourceSystem): string {
  if (!value || value.trim() === "") return "";
  const trimmed = value.trim();

  // Already in YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // MM/DD/YYYY or M/D/YYYY (common in QuickBooks, Wave)
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;
  }

  // DD/MM/YYYY (common in Xero, FreshBooks outside US)
  const euMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (euMatch) {
    return `${euMatch[3]}-${euMatch[2].padStart(2, "0")}-${euMatch[1].padStart(2, "0")}`;
  }

  // DD MMM YYYY or DD-MMM-YYYY (e.g. "15 Jan 2024")
  const monthNames: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const namedMatch = trimmed.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[\s-](\d{4})$/);
  if (namedMatch) {
    const month = monthNames[namedMatch[2].toLowerCase()];
    if (month) return `${namedMatch[3]}-${month}-${namedMatch[1].padStart(2, "0")}`;
  }

  // Fallback: try JS Date parsing
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }

  return trimmed;
}

const QB_ACCOUNT_TYPE_MAP: Record<string, string> = {
  "bank": "asset",
  "other current asset": "asset",
  "fixed asset": "asset",
  "other asset": "asset",
  "accounts receivable": "asset",
  "accounts payable": "liability",
  "credit card": "liability",
  "other current liability": "liability",
  "long term liability": "liability",
  "equity": "equity",
  "income": "revenue",
  "other income": "revenue",
  "cost of goods sold": "expense",
  "expense": "expense",
  "other expense": "expense",
};

const XERO_ACCOUNT_TYPE_MAP: Record<string, string> = {
  "bank": "asset",
  "current": "asset",
  "currliab": "liability",
  "depreciatn": "expense",
  "directcosts": "expense",
  "equity": "equity",
  "expense": "expense",
  "fixed": "asset",
  "inventory": "asset",
  "liability": "liability",
  "noncurrent": "asset",
  "otherincome": "revenue",
  "overheads": "expense",
  "prepayment": "asset",
  "revenue": "revenue",
  "sales": "revenue",
  "termliab": "liability",
  "paygliability": "liability",
  "superannuationexpense": "expense",
  "superannuationliability": "liability",
  "wagesexpense": "expense",
};

/**
 * Normalize account type strings from various sources to Dubbl types.
 */
export function normalizeAccountType(value: string, source: SourceSystem): string {
  const lower = value.toLowerCase().trim();
  if (["asset", "liability", "equity", "revenue", "expense"].includes(lower)) {
    return lower;
  }

  if (source === "quickbooks") {
    return QB_ACCOUNT_TYPE_MAP[lower] || "expense";
  }
  if (source === "xero") {
    return XERO_ACCOUNT_TYPE_MAP[lower] || "expense";
  }

  // FreshBooks and Wave use similar naming to QuickBooks
  return QB_ACCOUNT_TYPE_MAP[lower] || "expense";
}

/**
 * Normalize contact type to Dubbl enum.
 */
export function normalizeContactType(value: string): "customer" | "supplier" | "both" {
  const lower = value.toLowerCase().trim();
  if (lower === "vendor" || lower === "supplier") return "supplier";
  if (lower === "both" || lower === "customer & vendor") return "both";
  return "customer";
}

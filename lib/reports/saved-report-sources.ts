/**
 * The data sources a saved (custom) report can use, with their columns and
 * which columns hold money (integer cents). Pure, so the report builder page
 * can import it as well as the server code in saved-report-data.ts.
 */
export interface DataSourceInfo {
  label: string;
  columns: string[];
  moneyColumns: string[];
  /** Short plain-language note for the builder. */
  description: string;
  /** For grouped sources: the column naming each row (always included). */
  keyColumn?: string;
}

export const SAVED_REPORT_SOURCES = {
  invoices: {
    label: "Invoices",
    columns: ["invoiceNumber", "contactName", "status", "issueDate", "dueDate", "subtotal", "taxTotal", "total", "amountPaid", "amountDue", "currencyCode"],
    moneyColumns: ["subtotal", "taxTotal", "total", "amountPaid", "amountDue"],
    description: "One row per invoice.",
  },
  contacts: {
    label: "Contacts",
    columns: ["name", "email", "type", "phone", "paymentTermsDays", "creditLimit"],
    moneyColumns: ["creditLimit"],
    description: "One row per customer or supplier.",
  },
  inventory: {
    label: "Inventory",
    columns: ["code", "name", "category", "purchasePrice", "salePrice", "quantityOnHand", "reorderPoint", "isActive"],
    moneyColumns: ["purchasePrice", "salePrice"],
    description: "One row per item.",
  },
  transactions: {
    label: "Bank transactions",
    columns: ["date", "description", "amount", "status", "payee"],
    moneyColumns: ["amount"],
    description: "One row per bank transaction.",
  },
  expenses: {
    label: "Expenses",
    columns: ["title", "status", "totalAmount", "currencyCode", "submittedAt", "approvedAt"],
    moneyColumns: ["totalAmount"],
    description: "One row per expense claim.",
  },
  payroll: {
    label: "Payroll",
    columns: ["employeeName", "payPeriodStart", "payPeriodEnd", "type", "grossAmount", "taxAmount", "deductions", "netAmount"],
    moneyColumns: ["grossAmount", "taxAmount", "deductions", "netAmount"],
    description: "One row per payslip line.",
  },
  profit_loss: {
    label: "Money in vs money out by month",
    columns: ["month", "revenue", "expenses", "net"],
    moneyColumns: ["revenue", "expenses", "net"],
    keyColumn: "month",
    description: "Income, costs and profit for each month in the date range (this year if none).",
  },
  ar_aging: {
    label: "Who owes you, by age",
    columns: ["contact", "current", "30days", "60days", "90days", "120plus", "total"],
    moneyColumns: ["current", "30days", "60days", "90days", "120plus", "total"],
    keyColumn: "contact",
    description: "Unpaid invoices per customer: not yet due, 1-30, 31-60, 61-90 and over 90 days late.",
  },
  cash_flow: {
    label: "Bank money in and out by month",
    columns: ["month", "inflows", "outflows", "net"],
    moneyColumns: ["inflows", "outflows", "net"],
    keyColumn: "month",
    description: "Money into and out of your bank accounts each month (last 12 months if no date range).",
  },
  expense_by_cost_center: {
    label: "Costs by department",
    columns: ["category", "amount", "percentage"],
    moneyColumns: ["amount"],
    keyColumn: "category",
    description: "Costs split by cost center for the date range (this year if none).",
  },
} satisfies Record<string, DataSourceInfo>;

export type SavedReportSource = keyof typeof SAVED_REPORT_SOURCES;
export const SAVED_REPORT_SOURCE_KEYS = Object.keys(SAVED_REPORT_SOURCES) as [SavedReportSource, ...SavedReportSource[]];

export function isSavedReportSource(s: string): s is SavedReportSource {
  return s in SAVED_REPORT_SOURCES;
}

/** Human column header: "amountDue" -> "Amount due", "30days" -> "1-30 days". */
export function columnLabel(col: string): string {
  const special: Record<string, string> = {
    current: "Not yet due",
    "30days": "1-30 days",
    "60days": "31-60 days",
    "90days": "61-90 days",
    "120plus": "Over 90 days",
  };
  if (special[col]) return special[col];
  const words = col.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

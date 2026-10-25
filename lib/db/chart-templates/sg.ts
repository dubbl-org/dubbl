import type { AccountTemplate } from "./types";

/**
 * Singapore chart of accounts.
 *
 * Singapore has no legally mandated chart, so this follows common SME practice
 * (codes 1000–8999) and — more importantly — gives every Form C-S particular and
 * SFRS caption its own `subType`, which is what the return boxes and the XBRL
 * mapping read. The system control accounts keep their stable codes:
 * 1500 input GST, 2200 output GST, 2240 GST clearing.
 */
export const SG_ACCOUNTS: AccountTemplate[] = [
  // ── Current assets ──
  { code: "1000", name: "Cash on Hand", type: "asset", subType: "current" },
  { code: "1100", name: "Bank — DBS Current Account", type: "asset", subType: "bank" },
  { code: "1110", name: "Bank — OCBC Current Account", type: "asset", subType: "bank" },
  { code: "1120", name: "Bank — Multi-Currency Account", type: "asset", subType: "bank" },
  { code: "1150", name: "Fixed Deposit", type: "asset", subType: "current" },
  { code: "1200", name: "Trade Receivables", type: "asset", subType: "receivable" },
  { code: "1210", name: "Accrued Revenue", type: "asset", subType: "receivable" },
  { code: "1220", name: "Allowance for Doubtful Receivables", type: "asset", subType: "receivable" },
  { code: "1250", name: "Other Receivables", type: "asset", subType: "receivable" },
  { code: "1260", name: "Amounts Due from Related Parties", type: "asset", subType: "receivable" },
  { code: "1300", name: "Inventory", type: "asset", subType: "inventory" },
  { code: "1310", name: "Goods in Transit", type: "asset", subType: "inventory" },
  { code: "1400", name: "Prepaid Expenses", type: "asset", subType: "prepaid" },
  { code: "1410", name: "Prepaid Rent", type: "asset", subType: "prepaid" },
  { code: "1420", name: "Security Deposits", type: "asset", subType: "prepaid" },
  { code: "1500", name: "Input GST", type: "asset", subType: "input_vat" },
  { code: "1510", name: "GST Refund Receivable", type: "asset", subType: "input_vat" },
  { code: "1600", name: "Income Tax Paid (Advance)", type: "asset", subType: "current" },

  // ── Non-current assets ──
  { code: "1700", name: "Computer Equipment", type: "asset", subType: "fixed" },
  { code: "1710", name: "Office Equipment", type: "asset", subType: "fixed" },
  { code: "1720", name: "Furniture and Fittings", type: "asset", subType: "fixed" },
  { code: "1730", name: "Renovation", type: "asset", subType: "fixed" },
  { code: "1740", name: "Motor Vehicles", type: "asset", subType: "fixed" },
  { code: "1780", name: "Accumulated Depreciation", type: "asset", subType: "fixed" },
  { code: "1800", name: "Intangible Assets — Software", type: "asset", subType: "intangible" },
  { code: "1810", name: "Accumulated Amortisation", type: "asset", subType: "intangible" },
  { code: "1900", name: "Long-Term Deposits", type: "asset", subType: "non_current" },
  { code: "1910", name: "Investment in Subsidiary", type: "asset", subType: "investment" },

  // ── Current liabilities ──
  { code: "2100", name: "Trade Payables", type: "liability", subType: "current" },
  { code: "2110", name: "Accrued Expenses", type: "liability", subType: "current" },
  { code: "2120", name: "GST Payable — Deferred", type: "liability", subType: "current" },
  { code: "2200", name: "Output GST", type: "liability", subType: "output_vat" },
  { code: "2220", name: "Income Tax Payable", type: "liability", subType: "tax" },
  { code: "2240", name: "GST Suspense / Return Clearing", type: "liability", subType: "current" },
  { code: "2260", name: "CPF Payable", type: "liability", subType: "current" },
  { code: "2270", name: "Withholding Tax Payable", type: "liability", subType: "tax" },
  { code: "2280", name: "Goods and Services Tax Payable", type: "liability", subType: "tax" },
  { code: "2300", name: "Amounts Due to Directors", type: "liability", subType: "current" },
  { code: "2310", name: "Amounts Due to Related Parties", type: "liability", subType: "current" },

  // ── Non-current liabilities ──
  { code: "2500", name: "Term Loan", type: "liability", subType: "non_current" },
  { code: "2510", name: "Director's Loan", type: "liability", subType: "non_current" },
  { code: "2520", name: "Lease Liabilities", type: "liability", subType: "non_current" },
  { code: "2530", name: "Deferred Tax Liability", type: "liability", subType: "non_current" },

  // ── Equity ──
  { code: "3000", name: "Share Capital", type: "equity", subType: "equity" },
  { code: "3100", name: "Share Premium", type: "equity", subType: "equity" },
  { code: "3200", name: "Retained Earnings", type: "equity", subType: "retained" },
  { code: "3300", name: "Dividends Declared", type: "equity", subType: "retained" },

  // ── Revenue ──
  { code: "4000", name: "Sales — Goods", type: "revenue", subType: "revenue" },
  { code: "4010", name: "Sales — Services", type: "revenue", subType: "revenue" },
  { code: "4020", name: "Subscription Revenue", type: "revenue", subType: "revenue" },
  { code: "4030", name: "Professional Services", type: "revenue", subType: "revenue" },
  { code: "4200", name: "Export Sales (Zero-Rated)", type: "revenue", subType: "revenue" },
  { code: "4210", name: "International Services (Zero-Rated)", type: "revenue", subType: "revenue" },
  { code: "4300", name: "Other Income", type: "revenue", subType: "non_operating" },
  { code: "4310", name: "Interest Income", type: "revenue", subType: "non_operating" },
  { code: "4320", name: "Government Grants", type: "revenue", subType: "non_operating" },
  { code: "4330", name: "Foreign Exchange Gain", type: "revenue", subType: "non_operating" },

  // ── Cost of sales ──
  { code: "5000", name: "Purchases", type: "expense", subType: "cogs" },
  { code: "5010", name: "Freight and Shipping", type: "expense", subType: "cogs" },
  { code: "5020", name: "Subcontractor Costs", type: "expense", subType: "cogs" },
  { code: "5030", name: "Hosting and Infrastructure", type: "expense", subType: "cogs" },
  { code: "5090", name: "Inventory Write-Down", type: "expense", subType: "cogs" },

  // ── Employee benefits (Form C-S particulars) ──
  { code: "6100", name: "Directors' Fees and Remuneration", type: "expense", subType: "directors_fees" },
  { code: "6110", name: "Salaries and Wages", type: "expense", subType: "payroll" },
  { code: "6115", name: "Bonuses", type: "expense", subType: "payroll" },
  { code: "6120", name: "Employer CPF Contributions", type: "expense", subType: "statutory" },
  { code: "6125", name: "Skills Development Levy", type: "expense", subType: "statutory" },
  { code: "6130", name: "Medical Expenses", type: "expense", subType: "medical" },
  { code: "6135", name: "Insurance — Staff Benefits", type: "expense", subType: "medical" },

  // ── Other operating expenses ──
  { code: "6140", name: "Transport and Travelling", type: "expense", subType: "transport" },
  { code: "6145", name: "Airfare and Accommodation", type: "expense", subType: "transport" },
  { code: "6150", name: "Entertainment", type: "expense", subType: "entertainment" },
  { code: "6160", name: "ACRA and Secretarial Fees", type: "expense", subType: "professional" },
  { code: "6170", name: "Audit and Accounting Fees", type: "expense", subType: "professional" },
  { code: "6180", name: "Legal and Professional Fees", type: "expense", subType: "professional" },
  { code: "6200", name: "Rent", type: "expense", subType: "operating" },
  { code: "6210", name: "Utilities", type: "expense", subType: "operating" },
  { code: "6220", name: "Telecommunications", type: "expense", subType: "operating" },
  { code: "6230", name: "Software Subscriptions", type: "expense", subType: "operating" },
  { code: "6240", name: "Marketing and Advertising", type: "expense", subType: "operating" },
  { code: "6250", name: "Office Supplies", type: "expense", subType: "operating" },
  { code: "6260", name: "Bank Charges", type: "expense", subType: "operating" },
  { code: "6270", name: "Insurance", type: "expense", subType: "operating" },
  { code: "6280", name: "Training", type: "expense", subType: "operating" },
  { code: "5500", name: "Depreciation Expense", type: "expense", subType: "depreciation" },
  { code: "5510", name: "Amortisation Expense", type: "expense", subType: "depreciation" },
  { code: "5600", name: "Foreign Exchange Loss", type: "expense", subType: "non_operating" },
  { code: "5610", name: "Interest Expense", type: "expense", subType: "non_operating" },

  // ── Tax ──
  { code: "8200", name: "Income Tax Expense", type: "expense", subType: "non_operating" },
];

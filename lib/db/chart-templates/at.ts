import type { AccountTemplate } from "./types";

/** Austrian Einheitskontenrahmen (EKR) / SKR 07 chart of accounts */
export const AT_ACCOUNTS: AccountTemplate[] = [
  // Class 0: Fixed Assets
  { code: "0100", name: "Intangible Assets", type: "asset", subType: "fixed" },
  { code: "0120", name: "Software", type: "asset", subType: "fixed" },
  { code: "0210", name: "Developed Land", type: "asset", subType: "fixed" },
  { code: "0300", name: "Buildings", type: "asset", subType: "fixed" },
  { code: "0400", name: "Machinery", type: "asset", subType: "fixed" },
  { code: "0500", name: "Tools", type: "asset", subType: "fixed" },
  { code: "0620", name: "Office Equipment and IT", type: "asset", subType: "fixed" },
  { code: "0630", name: "Vehicles (Cars)", type: "asset", subType: "fixed" },
  { code: "0660", name: "Furniture and Fixtures", type: "asset", subType: "fixed" },
  // Class 1: Inventories
  { code: "1100", name: "Raw Materials Inventory", type: "asset", subType: "current" },
  { code: "1500", name: "Finished Goods Inventory", type: "asset", subType: "current" },
  { code: "1600", name: "Merchandise Inventory", type: "asset", subType: "current" },
  // Class 2: Current Assets, Cash, Bank
  { code: "2000", name: "Accounts Receivable (Domestic)", type: "asset", subType: "current" },
  { code: "2100", name: "Accounts Receivable (EU)", type: "asset", subType: "current" },
  { code: "2300", name: "Other Receivables", type: "asset", subType: "current" },
  { code: "2500", name: "Input VAT (Vorsteuer)", type: "asset", subType: "current" },
  { code: "2700", name: "Cash on Hand", type: "asset", subType: "current" },
  { code: "2800", name: "Bank Account", type: "asset", subType: "current" },
  { code: "2900", name: "Prepaid Expenses", type: "asset", subType: "current" },
  // Class 3: Liabilities, Provisions
  { code: "3030", name: "Provision for Corporate Income Tax", type: "liability", subType: "current" },
  { code: "3090", name: "Other Provisions", type: "liability", subType: "current" },
  { code: "3150", name: "Bank Loans", type: "liability", subType: "non_current" },
  { code: "3300", name: "Accounts Payable (Domestic)", type: "liability", subType: "current" },
  { code: "3500", name: "Output VAT (Umsatzsteuer)", type: "liability", subType: "current" },
  { code: "3520", name: "VAT Payable", type: "liability", subType: "current" },
  { code: "3540", name: "Tax Authorities Payable", type: "liability", subType: "current" },
  { code: "3600", name: "Social Security Payable", type: "liability", subType: "current" },
  { code: "3700", name: "Other Loans (Non-Bank)", type: "liability", subType: "non_current" },
  { code: "3850", name: "Wages and Salaries Payable", type: "liability", subType: "current" },
  { code: "3900", name: "Deferred Revenue", type: "liability", subType: "current" },
  // Class 4: Revenue
  { code: "4000", name: "Sales Revenue (20% VAT)", type: "revenue", subType: "operating" },
  { code: "4010", name: "Intra-Community Sales (EU)", type: "revenue", subType: "operating" },
  { code: "4015", name: "Export Sales", type: "revenue", subType: "operating" },
  { code: "4630", name: "Gain on Disposal of Fixed Assets", type: "revenue", subType: "non_operating" },
  { code: "4810", name: "Rental Income", type: "revenue", subType: "non_operating" },
  { code: "4880", name: "Other Operating Income", type: "revenue", subType: "non_operating" },
  // Class 5: Material and Merchandise Expenses
  { code: "5010", name: "Cost of Goods Sold", type: "expense", subType: "cogs" },
  { code: "5100", name: "Raw Materials Used", type: "expense", subType: "cogs" },
  { code: "5400", name: "Operating Supplies Used", type: "expense", subType: "cogs" },
  { code: "5640", name: "Energy Costs (Electricity and Gas)", type: "expense", subType: "cogs" },
  // Class 6: Personnel Expenses
  { code: "6200", name: "Salaries", type: "expense", subType: "operating" },
  { code: "6500", name: "Social Security Contributions (Workers)", type: "expense", subType: "operating" },
  { code: "6560", name: "Social Security Contributions (Employees)", type: "expense", subType: "operating" },
  { code: "6600", name: "Employer Contributions (DB, DZ, KommSt)", type: "expense", subType: "operating" },
  // Class 7: Other Operating Expenses, Depreciation
  { code: "7010", name: "Depreciation of Tangible Assets", type: "expense", subType: "operating" },
  { code: "7200", name: "Maintenance and Repairs", type: "expense", subType: "operating" },
  { code: "7320", name: "Vehicle Operating Costs", type: "expense", subType: "operating" },
  { code: "7380", name: "Telephone Costs", type: "expense", subType: "operating" },
  { code: "7400", name: "Rent Expense", type: "expense", subType: "operating" },
  { code: "7600", name: "Office Supplies", type: "expense", subType: "operating" },
  { code: "7650", name: "Advertising Expense", type: "expense", subType: "operating" },
  { code: "7700", name: "Insurance Expense", type: "expense", subType: "operating" },
  { code: "7750", name: "Legal and Consulting Fees", type: "expense", subType: "operating" },
  { code: "7790", name: "Bank Charges", type: "expense", subType: "operating" },
  // Class 8: Financial Income/Expense
  { code: "8100", name: "Interest Income", type: "revenue", subType: "non_operating" },
  { code: "8280", name: "Interest Expense on Bank Loans", type: "expense", subType: "non_operating" },
  { code: "8500", name: "Corporate Income Tax", type: "expense", subType: "tax" },
  // Class 9: Equity
  { code: "9000", name: "Share Capital", type: "equity", subType: "equity" },
  { code: "9200", name: "Capital Reserves", type: "equity", subType: "equity" },
  { code: "9390", name: "Retained Earnings", type: "equity", subType: "retained" },
  { code: "9880", name: "Profit/Loss Carried Forward", type: "equity", subType: "retained" },
];

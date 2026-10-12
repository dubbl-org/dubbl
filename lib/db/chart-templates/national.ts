import type { AccountKind, AccountTemplate, ChartTemplate, DefaultTax } from "./types";
import { FR_ACCOUNTS } from "./fr";
import { ES_ACCOUNTS } from "./es";
import { DE_ACCOUNTS } from "./de";
import { SE_ACCOUNTS } from "./se";
import { BR_ACCOUNTS } from "./br";
import { BE_ACCOUNTS } from "./be";
import { AT_ACCOUNTS } from "./at";
import { IT_ACCOUNTS } from "./it";
import { PT_ACCOUNTS } from "./pt";

/**
 * Role-mapped national charts
 * ===========================
 * The legally mandated / de facto charts (PCG, PGC, SKR03, BAS…) with every
 * account the posting engine needs mapped to its role. A new French org's
 * invoices then hit 411 Clients and 4457 TVA collectée instead of a parallel
 * generic "1200" / "2200" — and SKR03's 1200 *Bank* is never mistaken for
 * receivables. Legacy orgs (organization.chartTemplate = null) keep the plain
 * lists in ./fr.ts etc., matched by code as before.
 */

type RoleMap = Record<string, string[]>;

function a(code: string, name: string, type: AccountKind, subType: string, roles: string[]): AccountTemplate {
  const def: AccountTemplate = { code, name, type, subType, roles };
  const tax = inferTax(def, roles);
  return tax ? { ...def, tax } : def;
}

const OUT_OF_SCOPE = new Set(["5100", "5110", "5120", "5500", "5510", "5920", "5930", "5940", "6500", "8200", "4300", "4400", "4910", "4920"]);
const EXEMPT = new Set(["4100", "5400", "5900", "5910"]);

/**
 * The usual default tax for a P&L account, from what it is: sales and
 * everyday costs carry the standard rate; insurance, bank charges and
 * interest are exempt; wages, depreciation, FX and income tax are outside the
 * scope of VAT. Balance-sheet accounts get none.
 */
function inferTax(a: AccountTemplate, roles: string[]): DefaultTax | undefined {
  if (a.type !== "revenue" && a.type !== "expense") return undefined;
  if (a.subType === "tax" || roles.some((r) => OUT_OF_SCOPE.has(r))) return "none";
  if (roles.some((r) => EXEMPT.has(r))) return "exempt";
  return "standard";
}

/** Attach roles (and default tax) to a plain country list. Unmapped accounts get `[]`. */
function withRoles(accounts: AccountTemplate[], roles: RoleMap): AccountTemplate[] {
  const known = new Set(accounts.map((x) => x.code));
  for (const code of Object.keys(roles)) {
    if (!known.has(code)) throw new Error(`chart template role map names unknown code ${code}`);
  }
  return accounts.map((x) => {
    const r = roles[x.code] ?? [];
    const tax = inferTax(x, r);
    return { ...x, roles: r, ...(tax ? { tax } : {}) };
  });
}

const FR: ChartTemplate = {
  id: "fr",
  name: "Plan Comptable Général (France)",
  description: "The French PCG: 411 Clients, 401 Fournisseurs, 4457 TVA collectée, 4456 TVA déductible, 512 Banque, 706/707 sales, class 6 expenses.",
  accounts: withRoles(FR_ACCOUNTS, {
    "512": ["1100", "1110"], "530": ["1000", "1010"], "411": ["1200"], "491": ["1290"],
    "401": ["2000", "2100"], "408": ["2150"], "4457": ["2200"], "4456": ["1500"],
    "37": ["1300"], "31": ["1310"], "35": ["1320"], "486": ["1400"], "487": ["2400"],
    "421": ["2310"], "431": ["2235", "2236", "2245"], "444": ["2220"], "519": ["2500"], "164": ["2700"],
    "101": ["3300"], "108": ["3200", "3210"], "110": ["3100"],
    "706": ["4000", "4010", "4020"], "761": ["4100"], "752": ["4200"], "775": ["4300"], "758": ["4900"],
    "766": ["4910", "4920"], "666": ["5930", "5940"],
    "607": ["5000"], "611": ["5130"], "613": ["5200"], "616": ["5400"], "623": ["5600"],
    "6226": ["5720"], "6227": ["5710"], "626": ["5220", "5310"], "625": ["5800", "5810"],
    "6155": ["5240"], "627": ["5900"], "661": ["5910"], "641": ["5100"], "645": ["5120"],
    "681": ["5500"], "695": ["8200"],
    "2183": ["1600", "1620"], "2184": ["1610"], "2182": ["1630"], "213": ["1640"], "211": ["1650"],
    "281": ["1700", "1710", "1720", "1730"],
  }),
  onDemand: [
    a("4286", "Employee Expense Claims Payable", "liability", "current", ["2110"]),
    a("4686", "Accrued Expenses", "liability", "current", ["2300"]),
    a("5198", "Credit Card", "liability", "current", ["2600"]),
    a("890", "Opening Balance", "equity", "equity", ["3000"]),
    a("6453", "Pension Contributions", "expense", "operating", ["5110"]),
    a("5112", "Cheques to Deposit", "asset", "current", ["1250"]),
    a("44567", "VAT Credit to Carry Forward", "asset", "current", ["1270"]),
    a("4096", "Supplier Credit Notes Receivable", "asset", "current", ["1510"]),
    a("231", "Tangible Assets in Progress", "asset", "fixed", ["1660"]),
    a("4191", "Customer Advances Received", "liability", "current", ["2410"]),
    a("44551", "VAT Payable to Authority", "liability", "current", ["2240"]),
    a("44574", "Output VAT on Receipts Pending", "liability", "current", ["2260"]),
    a("455", "Partners' Current Accounts", "liability", "current", ["2510"]),
    a("471", "Suspense Account", "liability", "current", ["2520"]),
    a("105", "Revaluation Reserve", "equity", "equity", ["3400"]),
    a("7714", "Recovery of Written-off Receivables", "revenue", "non_operating", ["4400"]),
    a("603", "Change in Inventories", "expense", "cogs", ["5010", "5020"]),
    a("6061", "Utilities (Water, Energy)", "expense", "operating", ["5210"]),
    a("6064", "Office Supplies", "expense", "operating", ["5300"]),
    a("628", "Miscellaneous Expenses", "expense", "operating", ["5990"]),
    a("654", "Bad Debts Written Off", "expense", "operating", ["6500"]),
    a("675", "Book Value of Assets Disposed", "expense", "non_operating", ["5920"]),
    a("687", "Impairment Charges", "expense", "non_operating", ["5510"]),
  ],
  fallbackStart: { asset: "4687", liability: "4689", equity: "1090", revenue: "7580", expense: "6580" },
  bankStart: { asset: "5121", liability: "5191" },
};

const ES: ChartTemplate = {
  id: "es",
  name: "Plan General de Contabilidad (Spain)",
  description: "The Spanish PGC: 430 Clientes, 400 Proveedores, 477 IVA repercutido, 472 IVA soportado, 572 Bancos, 700/705 sales, group 6 expenses.",
  accounts: withRoles(ES_ACCOUNTS, {
    "572": ["1100", "1110"], "570": ["1000", "1010"], "430": ["1200"], "490": ["1290"], "470": ["1260"],
    "400": ["2000", "2100"], "477": ["2200"], "472": ["1500"],
    "300": ["1300"], "310": ["1310"], "350": ["1320"], "480": ["1400"],
    "465": ["2310"], "475": ["2220"], "476": ["2235", "2236", "2245"], "520": ["2500"], "170": ["2700"],
    "100": ["3300"], "118": ["3210"], "120": ["3100"],
    "700": ["4000"], "705": ["4010", "4020"], "762": ["4100"], "752": ["4200"], "771": ["4300"], "759": ["4900"],
    "768": ["4910", "4920"], "668": ["5930", "5940"],
    "600": ["5000"], "607": ["5130"], "621": ["5200"], "622": ["5240"], "623": ["5700", "5710", "5720"],
    "624": ["5310"], "625": ["5400"], "626": ["5900"], "627": ["5600"], "628": ["5210"], "629": ["5990"],
    "640": ["5100"], "642": ["5120"], "662": ["5910"], "681": ["5500"], "630": ["8200"],
    "213": ["1600"], "216": ["1610"], "217": ["1620"], "218": ["1630"], "211": ["1640"], "210": ["1650"],
    "281": ["1700", "1710", "1720", "1730"],
  }),
  onDemand: [
    a("5790", "Cash in Transit", "asset", "current", ["1250"]),
    a("4651", "Expense Claims Payable", "liability", "current", ["2110"]),
    a("4109", "Accrued Expenses", "liability", "current", ["2300"]),
    a("5209", "Credit Card", "liability", "current", ["2600"]),
    a("1290", "Opening Balance", "equity", "equity", ["3000"]),
    a("643", "Pension Contributions", "expense", "operating", ["5110"]),
    a("4700", "VAT Refund Due from Authority", "asset", "current", ["1270"]),
    a("4009", "Suppliers, Invoices Pending", "liability", "current", ["2150"]),
    a("438", "Customer Advances", "liability", "current", ["2410"]),
    a("4750", "VAT Payable to Authority", "liability", "current", ["2240"]),
    a("485", "Deferred Income", "liability", "current", ["2400"]),
    a("551", "Partner and Director Current Account", "liability", "current", ["2510"]),
    a("555", "Items Pending Allocation", "liability", "current", ["2520"]),
    a("557", "Interim Dividend", "equity", "equity", ["3220"]),
    a("610", "Change in Inventories", "expense", "cogs", ["5010", "5020"]),
    a("650", "Bad Debts", "expense", "operating", ["6500"]),
    a("671", "Loss on Disposal of Fixed Assets", "expense", "non_operating", ["5920"]),
    a("691", "Impairment of Fixed Assets", "expense", "non_operating", ["5510"]),
  ],
  fallbackStart: { asset: "4490", liability: "5590", equity: "1291", revenue: "7590", expense: "6290" },
  bankStart: { asset: "5721", liability: "5201" },
};

const DE: ChartTemplate = {
  id: "de",
  name: "SKR03 (Germany)",
  description: "DATEV SKR03: 1200 Bank, 1400 Forderungen, 1600 Verbindlichkeiten, 1776 Umsatzsteuer, 1576 Vorsteuer, 8400 Erlöse, 4xxx Betriebsausgaben.",
  accounts: withRoles(DE_ACCOUNTS, {
    "1200": ["1100", "1110"], "1000": ["1000", "1010"], "1400": ["1200"],
    "1600": ["2000", "2100"], "1776": ["2200"], "1576": ["1500"],
    "0955": ["2220"], "1742": ["2235", "2236", "2245"], "0630": ["2700"], "0750": ["2510"],
    "0800": ["3300"], "0880": ["3210"], "0860": ["3100"],
    "8400": ["4000", "4010", "4020"], "2650": ["4100"], "8600": ["4900"], "8820": ["4300"],
    "3400": ["5000"], "3100": ["5130"], "4100": ["5100"], "4130": ["5120"], "4210": ["5200"], "4240": ["5210"],
    "4500": ["5820"], "4600": ["5600"], "4660": ["5800"], "4730": ["5310"], "4800": ["5240"], "4830": ["5500"],
    "4920": ["5220"], "4930": ["5300"], "4950": ["5700", "5710"], "4955": ["5720"], "4970": ["5900"],
    "4980": ["5400"], "2100": ["5910"], "2200": ["8200"],
    "0420": ["1600", "1610", "1620"], "0320": ["1630"], "0050": ["1640", "1650"],
  }),
  onDemand: [
    a("0499", "Accumulated Depreciation", "asset", "fixed", ["1700", "1710", "1720", "1730"]),
    a("1709", "Employee Expense Claims Payable", "liability", "current", ["2110"]),
    a("0975", "Accrued Expenses", "liability", "current", ["2300"]),
    a("1730", "Credit Card Settlement", "liability", "current", ["2600"]),
    a("9000", "Opening Balance", "equity", "equity", ["3000"]),
    a("4165", "Pension Contributions", "expense", "operating", ["5110"]),
    a("1360", "Money in Transit", "asset", "current", ["1250"]),
    a("1545", "VAT Refund Claims", "asset", "current", ["1270"]),
    a("3970", "Inventory - Raw Materials", "asset", "current", ["1310"]),
    a("3980", "Inventory - Goods", "asset", "current", ["1300"]),
    a("7110", "Inventory - Finished Goods", "asset", "current", ["1320"]),
    a("0980", "Prepaid Expenses", "asset", "current", ["1400"]),
    a("0990", "Deferred Income", "liability", "current", ["2400"]),
    a("1718", "Customer Prepayments Received", "liability", "current", ["2410"]),
    a("1740", "Wages and Salaries Payable", "liability", "current", ["2310"]),
    a("1780", "VAT Prepayments / Return Clearing", "liability", "current", ["2240"]),
    a("1590", "Transit Items / Suspense", "liability", "current", ["2520"]),
    a("1800", "Owner Drawings", "equity", "equity", ["3200"]),
    a("1890", "Owner Contributions", "equity", "equity", ["3210"]),
    a("2660", "Foreign Exchange Gains", "revenue", "non_operating", ["4910", "4920"]),
    a("2150", "Foreign Exchange Losses", "expense", "non_operating", ["5930", "5940"]),
    a("2400", "Bad Debt Write-offs", "expense", "operating", ["6500"]),
    a("2320", "Loss on Disposal of Fixed Assets", "expense", "non_operating", ["5920"]),
    a("4806", "Software & IT Maintenance", "expense", "operating", ["5230"]),
    a("4900", "Other Operating Expenses", "expense", "operating", ["5990"]),
  ],
  fallbackStart: { asset: "1550", liability: "1795", equity: "0890", revenue: "8610", expense: "4990" },
  bankStart: { asset: "1210", liability: "1731" },
};

const SE: ChartTemplate = {
  id: "se",
  name: "BAS (Sweden)",
  description: "The Swedish BAS chart: 1930 Företagskonto, 1510 Kundfordringar, 2440 Leverantörsskulder, 2610 Utgående moms, 2640 Ingående moms, 2650 Momsredovisning, 3001 sales.",
  accounts: withRoles(SE_ACCOUNTS, {
    "1930": ["1100", "1110"], "1910": ["1000", "1010"], "1510": ["1200"], "1630": ["1260", "1270"],
    "2440": ["2000", "2100"], "2610": ["2200"], "2640": ["1500"], "2650": ["2240"],
    "1460": ["1300"], "1410": ["1310"], "1790": ["1400"], "2990": ["2300"],
    "2710": ["2235"], "2730": ["2236"], "2510": ["2220"], "2350": ["2700"],
    "2081": ["3300"], "2091": ["3100"],
    "3001": ["4000", "4010", "4020"], "3910": ["4200"], "8310": ["4100"],
    "4000": ["5000"], "4600": ["5130"], "5000": ["5200"], "5500": ["5240"], "5600": ["5820"], "5800": ["5800"],
    "5900": ["5600"], "6100": ["5300"], "6200": ["5220", "5310"], "6310": ["5400"], "6530": ["5720"],
    "6550": ["5700", "5710"], "6570": ["5900"], "7210": ["5100"], "7410": ["5110"], "7510": ["5120"],
    "7800": ["5500"], "8410": ["5910"], "8910": ["8200"],
    "1220": ["1600", "1610", "1620"], "1229": ["1700", "1710", "1720"], "1110": ["1640"], "1130": ["1650"],
  }),
  onDemand: [
    a("1690", "Money in Transit", "asset", "current", ["1250"]),
    a("2821", "Expense Claims Payable", "liability", "current", ["2110"]),
    a("2945", "Pension Contributions Payable", "liability", "current", ["2245"]),
    a("2870", "Credit Card", "liability", "current", ["2600"]),
    a("2097", "Opening Balance", "equity", "equity", ["3000"]),
    a("1519", "Write-down of Accounts Receivable", "asset", "current", ["1290"]),
    a("2420", "Customer Advances", "liability", "current", ["2410"]),
    a("2820", "Short-term Liabilities to Employees", "liability", "current", ["2310"]),
    a("2893", "Liabilities to Related Persons", "liability", "current", ["2510"]),
    a("2970", "Prepaid Income", "liability", "current", ["2400"]),
    a("2999", "Suspense Account", "liability", "current", ["2520"]),
    a("2013", "Owner Drawings", "equity", "equity", ["3200"]),
    a("2018", "Owner Contributions", "equity", "equity", ["3210"]),
    a("3960", "Foreign Exchange Gains", "revenue", "non_operating", ["4910", "4920"]),
    a("3973", "Gain on Disposal of Equipment", "revenue", "non_operating", ["4300"]),
    a("4990", "Change in Inventories", "expense", "cogs", ["5010", "5020"]),
    a("5420", "Software", "expense", "operating", ["5230"]),
    a("6351", "Bad Debts", "expense", "operating", ["6500"]),
    a("6990", "Other External Expenses", "expense", "operating", ["5990"]),
    a("7960", "Foreign Exchange Losses", "expense", "non_operating", ["5930", "5940"]),
    a("7973", "Loss on Disposal of Equipment", "expense", "non_operating", ["5920"]),
  ],
  fallbackStart: { asset: "1691", liability: "2890", equity: "2090", revenue: "3990", expense: "6980" },
  bankStart: { asset: "1931", liability: "2871" },
};

const BR: ChartTemplate = {
  id: "br",
  name: "Plano de Contas (Brazil)",
  description: "A Brazilian SPED-style chart: 1.1.02 Bancos, 1.1.04 Clientes, 2.1.01 Fornecedores, 3.3.01 Lucros Acumulados, 4.1.x receitas, 5.x custos e despesas.",
  accounts: withRoles(BR_ACCOUNTS, {
    "1.1.02": ["1100", "1110"], "1.1.01": ["1000", "1010"], "1.1.04": ["1200"], "1.1.05": ["1290"],
    "1.1.08": ["1500"], "1.1.10": ["1300"], "1.1.12": ["1310"], "1.1.15": ["1400"],
    "1.3.05": ["1650"], "1.3.06": ["1640"], "1.3.07": ["1600", "1620"], "1.3.08": ["1630"], "1.3.09": ["1610"],
    "1.3.10": ["1700", "1710", "1720", "1730"],
    "2.1.01": ["2000", "2100"], "2.1.02": ["2500"], "2.1.08": ["2220"], "2.1.10": ["2310"],
    "2.1.11": ["2236"], "2.1.12": ["2235"], "2.2.01": ["2700"], "2.2.03": ["2510"],
    "3.1.01": ["3300"], "3.3.01": ["3100"],
    "4.1.02": ["4000"], "4.1.03": ["4010", "4020"], "4.2.01": ["4100"], "4.3.01": ["4300"], "4.3.02": ["4900"],
    "5.1.04": ["5000"], "5.2.03": ["5100"], "5.2.04": ["5110", "5120"], "5.2.05": ["5200"],
    "5.2.06": ["5210", "5220"], "5.2.07": ["5500"], "5.2.08": ["5700", "5710", "5720"], "5.2.09": ["5400"],
    "5.2.10": ["5990"], "5.3.01": ["5910"], "5.3.02": ["5900"],
  }),
  onDemand: [
    a("2.1.21", "Expense Claims Payable", "liability", "current", ["2110"]),
    a("2.1.22", "Tax Return Clearing", "liability", "current", ["2240"]),
    a("2.1.23", "Pension Contributions Payable", "liability", "current", ["2245"]),
    a("2.1.24", "Credit Card", "liability", "current", ["2600"]),
    a("3.4.04", "Opening Balance", "equity", "equity", ["3000"]),
    a("5.4.01", "Income Tax Expense (IRPJ/CSLL)", "expense", "tax", ["8200"]),
    a("1.1.07", "Money in Transit", "asset", "current", ["1250"]),
    a("2.1.03", "Sales Taxes Payable", "liability", "current", ["2200"]),
    a("2.1.15", "Customer Advances", "liability", "current", ["2410"]),
    a("2.1.16", "Deferred Revenue", "liability", "current", ["2400"]),
    a("2.1.17", "Suspense", "liability", "current", ["2520"]),
    a("2.1.19", "Accrued Expenses", "liability", "current", ["2300"]),
    a("3.4.01", "Owner Withdrawals", "equity", "equity", ["3200"]),
    a("3.4.02", "Capital Contributions", "equity", "equity", ["3210"]),
    a("3.4.03", "Dividends Distributed", "equity", "equity", ["3220"]),
    a("4.2.02", "Foreign Exchange Gains", "revenue", "non_operating", ["4910", "4920"]),
    a("5.2.11", "Bad Debts", "expense", "operating", ["6500"]),
    a("5.2.12", "Marketing and Advertising", "expense", "operating", ["5600"]),
    a("5.2.13", "Travel Expenses", "expense", "operating", ["5800"]),
    a("5.3.03", "Foreign Exchange Losses", "expense", "non_operating", ["5930", "5940"]),
  ],
  fallbackStart: { asset: "1.1.20", liability: "2.1.20", equity: "3.4.10", revenue: "4.3.10", expense: "5.2.20" },
  bankStart: { asset: "1.1.20", liability: "2.1.20" },
};

const BE: ChartTemplate = {
  id: "be",
  name: "PCMN / MAR (Belgium)",
  description: "The Belgian minimum chart (PCMN/MAR): 400 Clients, 440 Fournisseurs, 451 TVA à payer, 411 TVA à récupérer, 550 Banque, 70 sales, 6x expenses.",
  accounts: withRoles(BE_ACCOUNTS, {
    "550": ["1100", "1110"], "570": ["1000", "1010"], "400": ["1200"], "411": ["1500"],
    "440": ["2000", "2100"], "451": ["2200"], "452": ["2220"], "453": ["2235"], "454": ["2236", "2245"],
    "455": ["2310"], "490": ["1400"], "493": ["2400"], "340": ["1300"], "300": ["1310"], "330": ["1320"],
    "173": ["2700"], "100": ["3300"], "140": ["3100"],
    "700": ["4000"], "702": ["4010", "4020"], "751": ["4100"], "741": ["4300"], "745": ["4200"], "749": ["4900"],
    "604": ["5000"], "610": ["5200"], "611": ["5210"], "613": ["5400"], "614": ["5310"],
    "615": ["5700", "5710", "5720"], "616": ["5220", "5800"], "619": ["5600"], "620": ["5100"], "621": ["5120"],
    "630": ["5500"], "650": ["5910"], "659": ["5900"], "670": ["8200"],
    "230": ["1600", "1620"], "240": ["1610"], "241": ["1630"], "221": ["1640"], "220": ["1650"],
  }),
  onDemand: [
    a("2309", "Accumulated Depreciation", "asset", "fixed", ["1700", "1710", "1720", "1730"]),
    a("4891", "Expense Claims Payable", "liability", "current", ["2110"]),
    a("492", "Accrued Charges", "liability", "current", ["2300"]),
    a("4899", "Credit Card", "liability", "current", ["2600"]),
    a("1399", "Opening Balance", "equity", "equity", ["3000"]),
    a("623", "Pension Contributions", "expense", "operating", ["5110"]),
    a("580", "Internal Transfers", "asset", "current", ["1250"]),
    a("4110", "VAT Refund Due", "asset", "current", ["1270"]),
    a("444", "Invoices to Receive", "liability", "current", ["2150"]),
    a("4510", "VAT Return Clearing", "liability", "current", ["2240"]),
    a("460", "Customer Advances Received", "liability", "current", ["2410"]),
    a("4890", "Director Current Account", "liability", "current", ["2510"]),
    a("499", "Suspense Account", "liability", "current", ["2520"]),
    a("754", "Foreign Exchange Gains", "revenue", "non_operating", ["4910", "4920"]),
    a("609", "Change in Inventories", "expense", "cogs", ["5010", "5020"]),
    a("634", "Write-downs on Trade Receivables", "expense", "operating", ["6500"]),
    a("654", "Foreign Exchange Losses", "expense", "non_operating", ["5930", "5940"]),
    a("663", "Loss on Disposal of Fixed Assets", "expense", "non_operating", ["5920"]),
  ],
  fallbackStart: { asset: "4160", liability: "4880", equity: "1390", revenue: "7490", expense: "6490" },
  bankStart: { asset: "5501", liability: "4930" },
};

const AT: ChartTemplate = {
  id: "at",
  name: "Einheitskontenrahmen (Austria)",
  description: "The Austrian EKR: 2800 Bank, 2000 Lieferforderungen, 3300 Lieferverbindlichkeiten, 3500 Umsatzsteuer, 2500 Vorsteuer, 3520 USt-Zahllast, 4000 Umsatzerlöse.",
  accounts: withRoles(AT_ACCOUNTS, {
    "2800": ["1100", "1110"], "2700": ["1000", "1010"], "2000": ["1200"], "2500": ["1500"],
    "3300": ["2000", "2100"], "3500": ["2200"], "3520": ["2240"], "3540": ["2220"],
    "3600": ["2235", "2236", "2245"], "3850": ["2310"], "3900": ["2400"], "2900": ["1400"],
    "1600": ["1300"], "1100": ["1310"], "1500": ["1320"], "3150": ["2700"], "9000": ["3300"], "9390": ["3100"],
    "4000": ["4000", "4010", "4020"], "8100": ["4100"], "4630": ["4300"], "4810": ["4200"], "4880": ["4900"],
    "5010": ["5000"], "5640": ["5210"], "6200": ["5100"], "6600": ["5120"], "7010": ["5500"], "7200": ["5240"],
    "7320": ["5820"], "7380": ["5220"], "7400": ["5200"], "7600": ["5300"], "7650": ["5600"], "7700": ["5400"],
    "7750": ["5700", "5710", "5720"], "7790": ["5900"], "8280": ["5910"], "8500": ["8200"],
    "0620": ["1600", "1620"], "0630": ["1630"], "0660": ["1610"], "0300": ["1640"], "0210": ["1650"],
  }),
  onDemand: [
    a("0390", "Accumulated Depreciation", "asset", "fixed", ["1700", "1710", "1720", "1730"]),
    a("3860", "Expense Claims Payable", "liability", "current", ["2110"]),
    a("3095", "Accrued Expenses", "liability", "current", ["2300"]),
    a("3170", "Credit Card", "liability", "current", ["2600"]),
    a("9800", "Opening Balance", "equity", "equity", ["3000"]),
    a("6700", "Pension Contributions", "expense", "operating", ["5110"]),
    a("2880", "Cash in Transit", "asset", "current", ["1250"]),
    a("2510", "VAT Refund Due", "asset", "current", ["1270"]),
    a("3200", "Customer Prepayments Received", "liability", "current", ["2410"]),
    a("3480", "Liabilities to Shareholders", "liability", "current", ["2510"]),
    a("3890", "Suspense Account", "liability", "current", ["2520"]),
    a("9600", "Owner Drawings", "equity", "equity", ["3200"]),
    a("9610", "Owner Contributions", "equity", "equity", ["3210"]),
    a("8060", "Foreign Exchange Gains", "revenue", "non_operating", ["4910", "4920"]),
    a("7800", "Bad Debt Write-offs", "expense", "operating", ["6500"]),
    a("7860", "Foreign Exchange Losses", "expense", "non_operating", ["5930", "5940"]),
  ],
  fallbackStart: { asset: "2310", liability: "3590", equity: "9400", revenue: "4890", expense: "7890" },
  bankStart: { asset: "2810", liability: "3171" },
};

const IT: ChartTemplate = {
  id: "it",
  name: "Piano dei Conti (Italy)",
  description: "An Italian piano dei conti: 1501 Banche, 1401 Crediti verso clienti, 2401 Debiti verso fornitori, 2403 IVA a debito, 1404 IVA a credito, 3101 ricavi.",
  accounts: withRoles(IT_ACCOUNTS, {
    "1501": ["1100", "1110"], "1502": ["1000", "1010"], "1401": ["1200"], "1404": ["1500"], "1405": ["1260", "1270"],
    "1408": ["1400"], "2401": ["2000", "2100"], "2403": ["2200"], "2404": ["2235"], "2405": ["2236", "2245"],
    "2406": ["2310"], "2407": ["2220"], "2409": ["2500"], "2410": ["2400"],
    "1303": ["1300"], "1301": ["1310"], "1302": ["1320"], "2301": ["2700"], "2302": ["2800"],
    "2101": ["3300"], "2104": ["3100"],
    "3101": ["4000"], "3102": ["4010", "4020"], "3103": ["4900"], "3201": ["4100"], "3202": ["4200"],
    "3203": ["4300"], "3204": ["4910", "4920"], "4502": ["5930", "5940"],
    "4101": ["5000"], "4201": ["5200"], "4202": ["5210"], "4203": ["5240"], "4204": ["5400"],
    "4205": ["5700", "5710", "5720"], "4206": ["5310"], "4207": ["5600"], "4208": ["5220"], "4209": ["5800", "5810"],
    "4210": ["5300"], "4211": ["5900"], "4301": ["5100"], "4302": ["5120"], "4401": ["5500"], "4501": ["5910"],
    "4601": ["8200"],
    "1204": ["1600"], "1205": ["1630"], "1206": ["1610"], "1207": ["1620"], "1202": ["1640"], "1201": ["1650"],
    "1212": ["1700", "1710", "1720", "1730"],
  }),
  onDemand: [
    a("2418", "Expense Claims Payable", "liability", "current", ["2110"]),
    a("2417", "Credit Card", "liability", "current", ["2600"]),
    a("2109", "Opening Balance", "equity", "equity", ["3000"]),
    a("4304", "Pension Contributions", "expense", "operating", ["5110"]),
    a("1409", "Allowance for Doubtful Receivables", "asset", "current", ["1290"]),
    a("1503", "Cash in Transit", "asset", "current", ["1250"]),
    a("2411", "Customer Advances", "liability", "current", ["2410"]),
    a("2412", "VAT Settlement", "liability", "current", ["2240"]),
    a("2413", "Shareholder Loans", "liability", "current", ["2510"]),
    a("2414", "Suspense Account", "liability", "current", ["2520"]),
    a("2415", "Accrued Expenses", "liability", "current", ["2300"]),
    a("2416", "Invoices to Receive", "liability", "current", ["2150"]),
    a("2106", "Owner Drawings", "equity", "equity", ["3200"]),
    a("2107", "Capital Contributions", "equity", "equity", ["3210"]),
    a("2108", "Dividends", "equity", "equity", ["3220"]),
    a("4103", "Change in Inventories", "expense", "cogs", ["5010", "5020"]),
    a("4212", "Bad Debts", "expense", "operating", ["6500"]),
    a("4213", "Software and Subscriptions", "expense", "operating", ["5230"]),
    a("4214", "Vehicle Expenses", "expense", "operating", ["5820"]),
    a("4215", "Sundry Expenses", "expense", "operating", ["5990"]),
    a("4503", "Loss on Disposal of Fixed Assets", "expense", "non_operating", ["5920"]),
  ],
  fallbackStart: { asset: "1410", liability: "2420", equity: "2110", revenue: "3210", expense: "4220" },
  bankStart: { asset: "1504", liability: "2419" },
};

const PT: ChartTemplate = {
  id: "pt",
  name: "SNC (Portugal)",
  description: "The Portuguese SNC: 12 Depósitos à ordem, 21 Clientes, 22 Fornecedores, 2433 IVA liquidado, 2432 IVA dedutível, 71/72 vendas e serviços.",
  accounts: withRoles(PT_ACCOUNTS, {
    "12": ["1100", "1110"], "11": ["1000", "1010"], "21": ["1200"], "279": ["1290"],
    "22": ["2000", "2100"], "2432": ["1500"], "2433": ["2200"], "241": ["2220"], "245": ["2236", "2245"],
    "262": ["2310"], "271": ["1400"], "272": ["2400"], "32": ["1300"], "33": ["1310"], "34": ["1320"],
    "51": ["3300"], "56": ["3100"],
    "71": ["4000"], "72": ["4010", "4020"], "78": ["4900"], "7911": ["4100"], "785": ["4300"],
    "788": ["4910", "4920"], "698": ["5930", "5940"],
    "61": ["5000"], "6211": ["5130"], "6212": ["5200"], "6214": ["5400"], "6217": ["5210"],
    "6221": ["5700", "5710", "5720"], "6222": ["5600"], "6226": ["5310"], "6231": ["5220"], "6232": ["5800"],
    "6233": ["5900"], "63": ["5100"], "635": ["5120"], "64": ["5500"], "68": ["5990"], "691": ["5910"],
    "6911": ["8200"],
    "433": ["1600"], "434": ["1630"], "435": ["1610", "1620"], "432": ["1640"], "431": ["1650"],
    "438": ["1700", "1710", "1720", "1730"],
  }),
  onDemand: [
    a("119", "Money in Transit", "asset", "current", ["1250"]),
    a("242", "Withholding Tax Payable", "liability", "current", ["2235"]),
    a("2783", "Expense Claims Payable", "liability", "current", ["2110"]),
    a("2785", "Credit Card", "liability", "current", ["2600"]),
    a("25", "Loans Obtained", "liability", "non_current", ["2700"]),
    a("599", "Opening Balance", "equity", "equity", ["3000"]),
    a("636", "Pension Contributions", "expense", "operating", ["5110"]),
    a("2437", "VAT to Recover", "asset", "current", ["1270"]),
    a("2436", "VAT Settlement", "liability", "current", ["2240"]),
    a("225", "Invoices Being Received", "liability", "current", ["2150"]),
    a("276", "Advances on Sales", "liability", "current", ["2410"]),
    a("268", "Shareholders' Current Accounts", "liability", "current", ["2510"]),
    a("2722", "Accrued Expenses", "liability", "current", ["2300"]),
    a("2789", "Suspense Account", "liability", "current", ["2520"]),
    a("38", "Inventory Adjustments", "expense", "cogs", ["5010", "5020"]),
    a("651", "Impairment of Receivables", "expense", "operating", ["6500"]),
  ],
  fallbackStart: { asset: "2791", liability: "2795", equity: "590", revenue: "789", expense: "689" },
  bankStart: { asset: "13", liability: "2511" },
};

export const NATIONAL_TEMPLATES: ChartTemplate[] = [FR, ES, DE, SE, BR, BE, AT, IT, PT];

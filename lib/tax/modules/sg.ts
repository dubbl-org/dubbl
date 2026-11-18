/**
 * Singapore module: GST F5, Form C-S, ECI, capital allowances, SFRS
 * presentation and the ACRA XBRL template.
 *
 * Filing position assumed: a smaller, non-publicly accountable company files
 * **Simplified** XBRL (`sg-sim`) plus a PDF of the FS. ACRA's template test is
 * revenue **and** total assets ≤ S$500,000 in the current FY — that is not the
 * Companies Act S$10m/50-employee "small company" test that drives audit
 * exemption. Crossing S$500k flips the company to Full in that year.
 */
import type { ModuleRate, TaxModule } from "@/lib/tax/types";

const GST_CONTROL = { output: "2200", input: "1500", suspense: "2240" } as const;

/**
 * GST rates, effective-dated so the 2023 → 2024 change is auditable. Both are
 * `standard` for posting; the supply category is what puts a supply in F5 box 1
 * rather than 2 or 3.
 */
const sgRates: ModuleRate[] = [
  { name: "GST 9% (Standard)", rate: 900, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000, isDefault: true, effectiveFrom: "2024-01-01", effectiveTo: null },
  { name: "GST 8% (2023)", rate: 800, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000, effectiveFrom: "2023-01-01", effectiveTo: "2023-12-31" },
  { name: "Zero-rated (exports, international services)", rate: 0, type: "both", kind: "standard", supplyCategory: "zero_rated", recoverablePercent: 10000, effectiveFrom: null, effectiveTo: null },
  { name: "GST Exempt", rate: 0, type: "both", kind: "exempt", supplyCategory: "exempt", recoverablePercent: 0, effectiveFrom: null, effectiveTo: null },
  { name: "Out of scope", rate: 0, type: "both", kind: "no_vat", supplyCategory: "outside_scope", recoverablePercent: 0, effectiveFrom: null, effectiveTo: null },
  { name: "Reverse charge — imported services / LVG", rate: 900, type: "purchase", kind: "reverse_charge", supplyCategory: "standard", recoverablePercent: 10000, effectiveFrom: "2020-01-01", effectiveTo: null },
];

/** The three parts of the printed F5, printed as ruled headings above the boxes. */
const SG_SUPPLIES = "Supplies and purchases";
const SG_TAX = "GST to be paid or claimed";
const SG_ADDITIONAL = "Additional information";
/** Annual returns print the accounts first, then the tax working. */
const SG_PNL = "Profit and loss";
const SG_TAX_COMPUTATION = "Tax computation";

/**
 * F5 boxes that IRAS wants keyed but that an SME leaves blank. The printed form
 * leaves 13 and 14 to be computed in the middle of them, so the hand-keyed ones
 * arrive in two runs.
 */
const sgManualEarly = [
  { box: "9", label: "Goods imported under AHTN / MES", help: "Imports where GST was paid to Singapore Customs, not to the supplier.", optional: true },
  { box: "10", label: "Imports under MES or A3PL", help: "Leave blank unless you buy through an approved third-party logistics scheme.", optional: true },
  { box: "11", label: "Tourist refunds", help: "Refunds you paid tourists under the Electronic Tourist Refund Scheme.", optional: true },
  { box: "12", label: "Bad debt relief / (recovery)", help: "GST relief on debts written off, less any relief you previously claimed and later recovered.", optional: true },
] as const;

const sgManualLate = [
  { box: "15", label: "Pre-registration GST", help: "GST on purchases and imports made before you registered.", optional: true },
  { box: "16", label: "GST on imported services (non-LVG)", help: "Reverse charge on imported services outside the LVG scheme.", optional: true },
  { box: "17", label: "GST on reverse-charge LVG purchases", help: "Reverse charge on low-value goods bought from an overseas supplier.", optional: true },
] as const;

export const SG_MODULE: TaxModule = {
  country: "SG",
  countryName: "Singapore",
  regime: "gst",
  taxName: "GST",
  // IRAS requires figures in SGD; a foreign-currency org's books must be
  // translated before filing.
  currencyRule: "local",
  chartTemplate: "SG",
  controlAccounts: GST_CONTROL,
  rates: sgRates,
  returns: [
    {
      kind: "gst_f5",
      title: "GST F5 return",
      authority: "IRAS",
      // GST cash accounting is not available in Singapore: accrual only.
      bases: ["accrual"],
      boxes: [
        {
          box: "1",
          label: "Total value of standard-rated supplies",
          help: "Everything you sold with GST charged at 9% (or 8% before 2024).",
          section: SG_SUPPLIES,
          compute: { type: "docLines", doc: "invoiceLine", measure: "net", supplyCategory: ["standard"] },
        },
        {
          box: "2",
          label: "Total value of zero-rated supplies",
          help: "Exports of goods and international services.",
          section: SG_SUPPLIES,
          compute: { type: "docLines", doc: "invoiceLine", measure: "net", supplyCategory: ["zero_rated"] },
        },
        {
          box: "3",
          label: "Total value of exempt supplies",
          help: "Financial services, residential property, and other exempt sales.",
          section: SG_SUPPLIES,
          compute: { type: "docLines", doc: "invoiceLine", measure: "net", supplyCategory: ["exempt"] },
        },
        {
          box: "4",
          label: "Total value of taxable supplies (1 + 2 + 3)",
          section: SG_SUPPLIES,
          compute: { type: "sum", of: ["1", "2", "3"] },
        },
        {
          box: "5",
          label: "Total value of taxable purchases",
          help: "Standard-rated purchases you paid GST on, including goods imported under AHTN.",
          section: SG_SUPPLIES,
          compute: { type: "docLines", doc: "billLine", measure: "net", supplyCategory: ["standard"] },
        },
        {
          box: "6",
          label: "Output tax",
          help: "GST you charged on sales, from the output GST control account.",
          section: SG_TAX,
          compute: {
            type: "controlAccount",
            account: "2200",
            sign: "credit",
            // Reverse charge output tax is reported in box 14, not box 6.
            excludingReverseCharge: "docLines",
          },
        },
        {
          box: "7",
          label: "Input tax and refunds claimed",
          help: "GST you can claim on purchases, from the input GST control account.",
          section: SG_TAX,
          compute: { type: "controlAccount", account: "1500", sign: "debit" },
        },
        {
          box: "8",
          label: "Net GST to be paid to IRAS / claimed from IRAS",
          help: "Box 6 minus box 7. Positive: pay IRAS. Negative: claim from IRAS.",
          section: SG_TAX,
          compute: { type: "difference", plus: ["6"], minus: ["7"] },
        },
        ...sgManualEarly.map((b) => ({ ...b, section: SG_ADDITIONAL, compute: { type: "manual" as const } })),
        {
          box: "13",
          label: "Revenue",
          help: "Your total revenue for the accounting period, from the profit and loss.",
          section: SG_ADDITIONAL,
          compute: { type: "revenueFromPnl" },
        },
        {
          box: "14",
          label: "GST on imported services / LVG (reverse charge)",
          help: "GST you accounted for yourself on services or low-value goods bought from overseas.",
          section: SG_ADDITIONAL,
          compute: { type: "reverseCharge", from: "docLines" },
        },
        ...sgManualLate.map((b) => ({ ...b, section: SG_ADDITIONAL, compute: { type: "manual" as const } })),
      ],
    },
    {
      kind: "form_c_s",
      title: "Form C-S workpaper",
      authority: "IRAS",
      bases: ["accrual"],
      boxes: [
        { box: "revenue", label: "Revenue", section: SG_PNL, compute: { type: "revenueFromPnl" } },
        { box: "cost_of_sales", label: "Cost of sales", section: SG_PNL, compute: { type: "accountTag", subType: "cogs", sign: "debit" } },
        {
          box: "gross_profit",
          label: "Gross profit",
          section: SG_PNL,
          compute: { type: "difference", plus: ["revenue"], minus: ["cost_of_sales"] },
        },
        { box: "directors_fees", label: "Directors' fees", section: SG_PNL, compute: { type: "accountTag", subType: "directors_fees", sign: "debit" } },
        { box: "remuneration", label: "Total remuneration (excluding directors' fees)", section: SG_PNL, compute: { type: "accountTag", subType: "payroll", sign: "debit" } },
        { box: "medical", label: "Medical expenses", section: SG_PNL, compute: { type: "accountTag", subType: "medical", sign: "debit" } },
        { box: "transport", label: "Transport and travelling", section: SG_PNL, compute: { type: "accountTag", subType: "transport", sign: "debit" } },
        { box: "entertainment", label: "Entertainment", section: SG_PNL, compute: { type: "accountTag", subType: "entertainment", sign: "debit" } },
        { box: "inventories", label: "Inventories at year end", section: SG_PNL, compute: { type: "accountTag", subType: "inventory", sign: "debit" } },
        { box: "trade_receivables", label: "Trade receivables", section: SG_PNL, compute: { type: "accountTag", subType: "receivable", sign: "debit" } },
        { box: "total_expenses", label: "Total expenses", section: SG_PNL, compute: { type: "accountType", accountType: "expense", sign: "debit" } },
        {
          box: "net_profit",
          label: "Net profit before tax",
          section: SG_PNL,
          compute: { type: "difference", plus: ["revenue"], minus: ["total_expenses"] },
        },
        {
          box: "add_backs",
          label: "Non-deductible expenses (add-backs)",
          section: SG_TAX_COMPUTATION,
          compute: { type: "accountTag", subType: "operating", sign: "debit", disallowedWeighted: true },
        },
        { box: "capital_allowances", label: "Capital allowances", section: SG_TAX_COMPUTATION, compute: { type: "taxBasisSchedule" } },
        {
          box: "chargeable_income",
          label: "Chargeable income before exemption",
          section: SG_TAX_COMPUTATION,
          compute: { type: "difference", plus: ["net_profit", "add_backs"], minus: ["capital_allowances"] },
        },
        { box: "exemption", label: "Partial / start-up tax exemption", section: SG_TAX_COMPUTATION, compute: { type: "taxBasisSchedule" } },
        {
          box: "chargeable_after_exemption",
          label: "Chargeable income after exemption",
          section: SG_TAX_COMPUTATION,
          compute: { type: "difference", plus: ["chargeable_income"], minus: ["exemption"] },
        },
      ],
    },
    {
      kind: "eci",
      title: "Estimated chargeable income",
      authority: "IRAS",
      bases: ["accrual"],
      boxes: [
        { box: "revenue", label: "Revenue", section: SG_PNL, compute: { type: "revenueFromPnl" } },
        { box: "total_expenses", label: "Total expenses", section: SG_PNL, compute: { type: "accountType", accountType: "expense", sign: "debit" } },
        {
          box: "net_profit",
          label: "Net profit before tax",
          section: SG_PNL,
          compute: { type: "difference", plus: ["revenue"], minus: ["total_expenses"] },
        },
        {
          box: "add_backs",
          label: "Non-deductible expenses (add-backs)",
          section: SG_TAX_COMPUTATION,
          compute: { type: "accountTag", subType: "operating", sign: "debit", disallowedWeighted: true },
        },
        { box: "capital_allowances", label: "Capital allowances", section: SG_TAX_COMPUTATION, compute: { type: "taxBasisSchedule" } },
        {
          box: "chargeable_income",
          label: "Estimated chargeable income before exemption",
          section: SG_TAX_COMPUTATION,
          compute: { type: "difference", plus: ["net_profit", "add_backs"], minus: ["capital_allowances"] },
        },
        { box: "exemption", label: "Partial / start-up tax exemption", section: SG_TAX_COMPUTATION, compute: { type: "taxBasisSchedule" } },
        {
          box: "eci",
          label: "Estimated chargeable income",
          section: SG_TAX_COMPUTATION,
          compute: { type: "difference", plus: ["chargeable_income"], minus: ["exemption"] },
        },
      ],
    },
    {
      kind: "capital_allowances",
      title: "Capital allowances workpaper",
      authority: "IRAS",
      bases: ["accrual"],
      boxes: [
        { box: "additions", label: "Additions in the year", compute: { type: "taxBasisSchedule" } },
        { box: "allowance", label: "Capital allowance for the year", compute: { type: "taxBasisSchedule" } },
        { box: "carried_forward", label: "Carried forward", compute: { type: "taxBasisSchedule" } },
      ],
    },
  ],
  periods: [
    { returnKind: "gst_f5", frequency: "quarterly", dueDays: 30 },
    { returnKind: "eci", frequency: "annual", dueDays: 90 },
    { returnKind: "form_c_s", frequency: "annual", dueDays: 335 },
  ],
  fsPresentation: {
    // SFRS captions: the balance sheet is grouped current/non-current and the
    // income statement by nature of expense (the only layout ACRA's Simplified
    // template offers). "<type>.<subType>" keys caption a subtag per statement
    // side; the plain key is the fallback for both.
    balanceSheetCaptions: {
      "asset.current": "Other current assets",
      "liability.current": "Trade and other payables",
      bank: "Cash and cash equivalents",
      receivable: "Trade and other receivables",
      inventory: "Inventories",
      current: "Other current assets",
      prepaid: "Prepayments",
      input_vat: "GST recoverable",
      fixed: "Property, plant and equipment",
      intangible: "Intangible assets",
      investment: "Investments",
      payable: "Trade and other payables",
      output_vat: "GST payable",
      tax: "Tax payable",
      loan: "Loans and borrowings",
      equity: "Share capital and reserves",
      retained: "Retained earnings",
      revenue: "Revenue",
      cogs: "Cost of sales",
      operating: "Other operating expenses",
      payroll: "Employee benefits expense",
      directors_fees: "Directors' remuneration",
      statutory: "Employer CPF and statutory contributions",
      medical: "Medical and staff benefits",
      transport: "Transport and travel",
      entertainment: "Entertainment",
      professional: "Professional and compliance fees",
      depreciation: "Depreciation expense",
      non_operating: "Other income and expenses",
    },
    incomeStatement: "nature",
    captionOrder: {
      assets: ["Cash and cash equivalents", "Trade and other receivables", "Inventories", "Prepayments", "GST recoverable", "Other current assets", "Property, plant and equipment", "Intangible assets", "Investments"],
      liabilities: ["Trade and other payables", "GST payable", "Tax payable", "Loans and borrowings"],
      equity: ["Share capital and reserves", "Retained earnings"],
      income: ["Revenue", "Other income and expenses"],
      expenses: ["Cost of sales", "Employee benefits expense", "Directors' remuneration", "Employer CPF and statutory contributions", "Depreciation expense", "Medical and staff benefits", "Transport and travel", "Entertainment", "Professional and compliance fees", "Other operating expenses"],
    },
  },
  xbrl: { templates: ["sim", "full"], authority: "ACRA" },
};

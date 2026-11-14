/**
 * The European/Commonwealth VAT-family modules: GB, NL, IE, ZA, AU, CA, IN.
 *
 * Data only — rates, control accounts and box definitions. GB's nine boxes and
 * the AU BAS fields are the shapes the existing routes produce; the boxes added
 * beyond a country's old `returnBoxes` list (GB 8/9, AU G2/G3) were already
 * returned by the routes and must not change.
 */
import type { ModuleRate, TaxModule, ReturnDefinition } from "@/lib/tax/types";

const VAT_CONTROL = { output: "2200", input: "1500", suspense: "2240" } as const;
const GST_CONTROL = { output: "2200", input: "1500", suspense: "2240" } as const;

/** Box ids/labels shared by the VAT-family returns, so drill-down stays uniform. */
const OUTPUT_TAX = (box: string, label: string, help: string) =>
  ({ box, label, help, compute: { type: "controlAccount", account: "2200", sign: "credit" } }) as const;

const INPUT_TAX = (box: string, label: string, help: string) =>
  ({ box, label, help, compute: { type: "controlAccount", account: "1500", sign: "debit" } }) as const;

const vat100: ReturnDefinition = {
  kind: "vat100",
  title: "VAT return",
  authority: "HMRC",
  bases: ["accrual", "cash"],
  boxes: [
    {
      box: "1",
      label: "VAT due on sales",
      help: "Output VAT on everything you sold in the period, from the output VAT control account.",
      compute: {
        type: "controlAccount",
        account: "2200",
        sign: "credit",
        excludingReverseCharge: "ledger",
      },
    },
    {
      box: "2",
      label: "VAT due on EU acquisitions",
      help: "VAT you accounted for yourself on purchases from the EU or Northern Ireland.",
      compute: { type: "reverseCharge", from: "ledger" },
    },
    {
      box: "3",
      label: "Total VAT due (Box 1 + 2)",
      compute: { type: "sum", of: ["1", "2"] },
    },
    {
      box: "4",
      label: "VAT reclaimed on purchases",
      help: "Input VAT you can reclaim, from the input VAT control account.",
      compute: { type: "controlAccount", account: "1500", sign: "debit" },
    },
    {
      box: "5",
      label: "Net VAT to pay/reclaim (Box 3 - 4)",
      compute: { type: "difference", plus: ["3"], minus: ["4"] },
    },
    {
      box: "6",
      label: "Total sales ex-VAT",
      compute: { type: "docTotal", doc: "invoice", measure: "net" },
    },
    {
      box: "7",
      label: "Total purchases ex-VAT",
      compute: { type: "docTotal", doc: "bill", measure: "net" },
    },
    {
      box: "8",
      label: "Total supplies to EU ex-VAT",
      help: "Sales to VAT-registered customers in another EU country.",
      compute: { type: "ecSales" },
    },
    {
      box: "9",
      label: "Total acquisitions from EU ex-VAT",
      help: "Purchases from VAT-registered suppliers in another EU country.",
      compute: { type: "ecAcquisitions" },
    },
  ],
};

const gbRates: ModuleRate[] = [
  { name: "Standard Rate (20%)", rate: 2000, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000, isDefault: true },
  { name: "Reduced Rate (5%)", rate: 500, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000 },
  { name: "Zero Rate (0%)", rate: 0, type: "both", kind: "standard", supplyCategory: "zero_rated", recoverablePercent: 10000 },
  { name: "Exempt", rate: 0, type: "both", kind: "exempt", supplyCategory: "exempt", recoverablePercent: 0 },
  { name: "Reverse Charge", rate: 2000, type: "purchase", kind: "reverse_charge", supplyCategory: "standard", recoverablePercent: 10000 },
  { name: "No VAT", rate: 0, type: "both", kind: "no_vat", supplyCategory: "outside_scope", recoverablePercent: 0 },
];

/** A VAT return whose only ledger-derived boxes are output and input tax. */
function simpleVatReturn(
  kind: string,
  title: string,
  authority: string,
  boxes: ReturnDefinition["boxes"]
): ReturnDefinition {
  return { kind, title, authority, bases: ["accrual", "cash"], boxes };
}

const zaRates: ModuleRate[] = [
  { name: "Standard Rate (15%)", rate: 1500, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000, isDefault: true },
  { name: "Zero Rate (0%)", rate: 0, type: "both", kind: "standard", supplyCategory: "zero_rated", recoverablePercent: 10000 },
  { name: "Exempt", rate: 0, type: "both", kind: "exempt", supplyCategory: "exempt", recoverablePercent: 0 },
  { name: "No VAT", rate: 0, type: "both", kind: "no_vat", supplyCategory: "outside_scope", recoverablePercent: 0 },
];

const auRates: ModuleRate[] = [
  { name: "GST (10%)", rate: 1000, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000, isDefault: true },
  { name: "GST Free", rate: 0, type: "both", kind: "standard", supplyCategory: "zero_rated", recoverablePercent: 10000 },
  { name: "Input Taxed", rate: 0, type: "both", kind: "exempt", supplyCategory: "exempt", recoverablePercent: 0 },
  { name: "No GST", rate: 0, type: "both", kind: "no_vat", supplyCategory: "outside_scope", recoverablePercent: 0 },
];

const caRates: ModuleRate[] = [
  { name: "GST (5%)", rate: 500, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000, isDefault: true },
  { name: "HST (13%)", rate: 1300, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000 },
  { name: "HST (15%)", rate: 1500, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000 },
  { name: "Zero Rated", rate: 0, type: "both", kind: "standard", supplyCategory: "zero_rated", recoverablePercent: 10000 },
  { name: "Exempt", rate: 0, type: "both", kind: "exempt", supplyCategory: "exempt", recoverablePercent: 0 },
  { name: "No GST", rate: 0, type: "both", kind: "no_vat", supplyCategory: "outside_scope", recoverablePercent: 0 },
];

const ieRates: ModuleRate[] = [
  { name: "Standard Rate (23%)", rate: 2300, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000, isDefault: true },
  { name: "Reduced Rate (13.5%)", rate: 1350, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000 },
  { name: "Second Reduced Rate (9%)", rate: 900, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000 },
  { name: "Zero Rate (0%)", rate: 0, type: "both", kind: "standard", supplyCategory: "zero_rated", recoverablePercent: 10000 },
  { name: "Exempt", rate: 0, type: "both", kind: "exempt", supplyCategory: "exempt", recoverablePercent: 0 },
  { name: "Reverse Charge", rate: 2300, type: "purchase", kind: "reverse_charge", supplyCategory: "standard", recoverablePercent: 10000 },
  { name: "No VAT", rate: 0, type: "both", kind: "no_vat", supplyCategory: "outside_scope", recoverablePercent: 0 },
];

const inRates: ModuleRate[] = [
  { name: "GST 18%", rate: 1800, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000, isDefault: true },
  { name: "GST 28%", rate: 2800, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000 },
  { name: "GST 12%", rate: 1200, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000 },
  { name: "GST 5%", rate: 500, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000 },
  { name: "GST 0% (Nil rated)", rate: 0, type: "both", kind: "standard", supplyCategory: "zero_rated", recoverablePercent: 10000 },
  { name: "Exempt", rate: 0, type: "both", kind: "exempt", supplyCategory: "exempt", recoverablePercent: 0 },
  { name: "Reverse Charge", rate: 1800, type: "purchase", kind: "reverse_charge", supplyCategory: "standard", recoverablePercent: 10000 },
];

const nlRates: ModuleRate[] = [
  { name: "Standard Rate (21%)", rate: 2100, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000, isDefault: true },
  { name: "Reduced Rate (9%)", rate: 900, type: "both", kind: "standard", supplyCategory: "standard", recoverablePercent: 10000 },
  { name: "Zero Rate (0%)", rate: 0, type: "both", kind: "standard", supplyCategory: "zero_rated", recoverablePercent: 10000 },
  { name: "Exempt", rate: 0, type: "both", kind: "exempt", supplyCategory: "exempt", recoverablePercent: 0 },
  { name: "Reverse Charge", rate: 2100, type: "purchase", kind: "reverse_charge", supplyCategory: "standard", recoverablePercent: 10000 },
  { name: "No VAT", rate: 0, type: "both", kind: "no_vat", supplyCategory: "outside_scope", recoverablePercent: 0 },
];

export const GB_MODULE: TaxModule = {
  country: "GB",
  countryName: "United Kingdom",
  regime: "vat",
  taxName: "VAT",
  currencyRule: "org-base",
  controlAccounts: VAT_CONTROL,
  rates: gbRates,
  returns: [vat100],
  periods: [{ returnKind: "vat100", frequency: "quarterly", dueDays: 39 }],
};

export const NL_MODULE: TaxModule = {
  country: "NL",
  countryName: "Netherlands",
  regime: "vat",
  taxName: "BTW (VAT)",
  currencyRule: "org-base",
  controlAccounts: VAT_CONTROL,
  rates: nlRates,
  returns: [
    simpleVatReturn("vat_return", "BTW return", "Belastingdienst", [
      {
        box: "1a",
        label: "Supplies at standard rate (VAT)",
        compute: { type: "controlAccount", account: "2200", sign: "credit" },
      },
      { box: "1b", label: "Supplies at reduced rate (VAT)", compute: { type: "manual" } },
      { box: "5a", label: "Total output VAT", compute: { type: "sum", of: ["1a", "1b"] } },
      { box: "5b", label: "Input VAT (voorbelasting)", compute: { type: "controlAccount", account: "1500", sign: "debit" } },
      { box: "5c", label: "Net VAT payable / refundable", compute: { type: "difference", plus: ["5a"], minus: ["5b"] } },
    ]),
  ],
  periods: [{ returnKind: "vat_return", frequency: "quarterly", dueDays: 30 }],
};

export const IE_MODULE: TaxModule = {
  country: "IE",
  countryName: "Ireland",
  regime: "vat",
  taxName: "VAT",
  currencyRule: "org-base",
  controlAccounts: VAT_CONTROL,
  rates: ieRates,
  returns: [
    simpleVatReturn("vat_return", "VAT3 return", "Revenue", [
      OUTPUT_TAX("T1", "VAT on sales", "Output VAT for the period."),
      INPUT_TAX("T2", "VAT on purchases", "Input VAT for the period."),
      { box: "T3", label: "Net payable (T1 − T2)", compute: { type: "difference", plus: ["T1"], minus: ["T2"] } },
      { box: "T4", label: "Net repayable (T2 − T1)", compute: { type: "difference", plus: ["T2"], minus: ["T1"] } },
    ]),
  ],
  periods: [{ returnKind: "vat_return", frequency: "quarterly", dueDays: 23 }],
};

export const ZA_MODULE: TaxModule = {
  country: "ZA",
  countryName: "South Africa",
  regime: "vat",
  taxName: "VAT",
  currencyRule: "org-base",
  controlAccounts: VAT_CONTROL,
  rates: zaRates,
  returns: [
    simpleVatReturn("vat_return", "VAT201 return", "SARS", [
      {
        box: "1",
        label: "Standard rated supplies (output VAT)",
        compute: { type: "docLines", doc: "invoiceLine", measure: "net", supplyCategory: ["standard"] },
      },
      OUTPUT_TAX("4", "Total output tax", "Output VAT for the period."),
      INPUT_TAX("14", "Total input tax", "Input VAT for the period."),
      { box: "20", label: "Net VAT payable / refundable", compute: { type: "difference", plus: ["4"], minus: ["14"] } },
    ]),
  ],
  periods: [{ returnKind: "vat_return", frequency: "monthly", dueDays: 25 }],
};

export const AU_MODULE: TaxModule = {
  country: "AU",
  countryName: "Australia",
  regime: "gst",
  taxName: "GST",
  currencyRule: "org-base",
  controlAccounts: GST_CONTROL,
  rates: auRates,
  returns: [
    {
      kind: "bas",
      title: "Business activity statement",
      authority: "ATO",
      bases: ["accrual", "cash"],
      boxes: [
        {
          box: "G1",
          label: "Total sales (including GST)",
          compute: { type: "docTotal", doc: "invoice", measure: "gross" },
        },
        { box: "G2", label: "Export sales", compute: { type: "ecSales" } },
        { box: "G3", label: "Other GST-free sales", compute: { type: "manual" }, optional: true },
        { box: "G10", label: "Capital purchases", compute: { type: "manual" }, optional: true },
        {
          box: "G11",
          label: "Non-capital purchases",
          compute: { type: "docTotal", doc: "bill", measure: "gross" },
        },
        OUTPUT_TAX("1A", "GST on sales", "GST collected on sales."),
        INPUT_TAX("1B", "GST on purchases", "GST paid on purchases."),
        { box: "NET", label: "Net GST (1A - 1B)", compute: { type: "difference", plus: ["1A"], minus: ["1B"] } },
      ],
    },
  ],
  periods: [{ returnKind: "bas", frequency: "quarterly", dueDays: 28 }],
};

export const CA_MODULE: TaxModule = {
  country: "CA",
  countryName: "Canada",
  regime: "gst",
  taxName: "GST/HST",
  currencyRule: "org-base",
  controlAccounts: GST_CONTROL,
  rates: caRates,
  returns: [
    simpleVatReturn("vat_return", "GST/HST return", "CRA", [
      {
        box: "101",
        label: "Sales and other revenue",
        compute: { type: "docTotal", doc: "invoice", measure: "net" },
      },
      OUTPUT_TAX("103", "GST/HST collected", "GST/HST collected on sales."),
      INPUT_TAX("106", "Input tax credits (ITCs)", "GST/HST paid on purchases."),
      { box: "109", label: "Net tax", compute: { type: "difference", plus: ["103"], minus: ["106"] } },
    ]),
  ],
  periods: [{ returnKind: "vat_return", frequency: "quarterly", dueDays: 30 }],
};

export const IN_MODULE: TaxModule = {
  country: "IN",
  countryName: "India",
  regime: "gst",
  taxName: "GST",
  currencyRule: "org-base",
  controlAccounts: GST_CONTROL,
  rates: inRates,
  returns: [
    simpleVatReturn("gstr3b", "GSTR-3B return", "GSTN", [
      OUTPUT_TAX("3.1(a)", "Outward taxable supplies (output tax)", "Output GST for the period."),
      INPUT_TAX("4(A)", "Input tax credit available", "Input GST credit for the period."),
      { box: "5", label: "Net tax payable", compute: { type: "difference", plus: ["3.1(a)"], minus: ["4(A)"] } },
    ]),
  ],
  periods: [{ returnKind: "gstr3b", frequency: "monthly", dueDays: 20 }],
};

export const EU_VAT_MODULES: TaxModule[] = [
  GB_MODULE,
  NL_MODULE,
  IE_MODULE,
  ZA_MODULE,
  AU_MODULE,
  CA_MODULE,
  IN_MODULE,
];

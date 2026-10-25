/**
 * Pluggable tax module types.
 *
 * A jurisdiction is *data*: a list of rates, one or more return definitions, and
 * (optionally) a financial-statement presentation and an XBRL template. The
 * engine (lib/tax/engine.ts) knows six query shapes and one switch — adding a
 * country never means adding a route or a page.
 *
 * Conventions: all amounts are integer minor units (cents); every rate is in
 * basis points (900 = 9.00%, recoverablePercent 10000 = 100%).
 */

/** Recognition basis: accrual (document/entry date) or cash (payment cleared). */
export type TaxBasis = "accrual" | "cash";

/**
 * How a supply is treated for the return's supply boxes. Distinct from
 * `kind` (posting behaviour): zero-rated and exempt both post 0% but land in
 * different boxes, and `kind` alone cannot tell them apart.
 */
export type SupplyCategory = "standard" | "zero_rated" | "exempt" | "outside_scope";

/** Posting/recovery behaviour (mirrors taxRateKindEnum in the schema). */
export type TaxRateKind =
  | "standard"
  | "blocked"
  | "partial_block"
  | "exempt"
  | "reverse_charge"
  | "no_vat"
  | "sales_tax_us";

/** A tax rate a module seeds into an org (tax_rate rows). */
export interface ModuleRate {
  name: string;
  /** Basis points (900 = 9%). */
  rate: number;
  type: "sales" | "purchase" | "both";
  kind: TaxRateKind;
  /** Supply classification for the return's supply boxes; null = treat as standard. */
  supplyCategory?: SupplyCategory | null;
  /** Share of input tax recoverable, basis points (10000 = 100%). */
  recoverablePercent: number;
  isDefault?: boolean;
  /** ISO dates, inclusive. null = no bound. */
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

/** Where a box's number comes from. Every case is one query shape. */
export type BoxSource =
  | {
      type: "controlAccount";
      account: string;
      /** Natural sign of the box: credit for output/liability, debit for input/asset. */
      sign: "credit" | "debit";
      /**
       * Subtract reverse-charge VAT already sitting on this account: "ledger"
       * uses the EU self-accounting heuristic (output credit on an entry that
       * also debits input), "docLines" sums reverse-charge tax on bill lines
       * (Singapore box 14, which a fully blocked charge still has).
       */
      excludingReverseCharge?: "ledger" | "docLines";
    }
  | { type: "reverseCharge"; from: "ledger" | "docLines" }
  | {
      type: "docLines";
      doc: "invoiceLine" | "billLine";
      measure: "net" | "tax" | "gross";
      /** Restrict to these supply categories; omitted = every rate. */
      supplyCategory?: SupplyCategory[];
    }
  | { type: "docTotal"; doc: "invoice" | "bill"; measure: "net" | "gross" }
  | { type: "ecSales" }
  | { type: "ecAcquisitions" }
  | { type: "revenueFromPnl" }
  /** Posted movement on all accounts of one type (Form C-S net profit, etc.). */
  | { type: "accountType"; accountType: "revenue" | "expense"; sign: "credit" | "debit" }
  /** Sum of earlier boxes in the same definition. */
  | { type: "sum"; of: string[] }
  /** Earlier boxes added, then subtracted. */
  | { type: "difference"; plus: string[]; minus: string[] }
  /** Typed by the user, persisted on tax_return_line with isCalculated=false. */
  | { type: "manual" }
  /** Balance of every account carrying this chartAccount.subType. */
  | { type: "accountTag"; subType: string; sign: "debit" | "credit"; disallowedWeighted?: boolean }
  /** Computed by a tax computation workpaper (capital allowances), not the ledger. */
  | { type: "taxBasisSchedule" };

/** One box/line on a return. */
export interface BoxSpec {
  box: string;
  label: string;
  /** Plain-English explanation shown under the box. */
  help?: string;
  /** May be left blank on the official form (e.g. SG F5 boxes 9–21 for an SME). */
  optional?: boolean;
  /** Part of the form this line sits in, printed as a ruled heading above it. */
  section?: string;
  compute: BoxSource;
}

/** A periodic (or annual) return a module can produce. */
export interface ReturnDefinition {
  /** Stable id, e.g. "vat100" | "gst_f5" | "form_c_s" | "eci". */
  kind: string;
  title: string;
  /** Filing authority, e.g. "HMRC" | "IRAS" | "ACRA". */
  authority: string;
  bases: TaxBasis[];
  boxes: BoxSpec[];
}

/** How to generate tax_period rows for a fiscal year. */
export interface PeriodRule {
  returnKind: string;
  frequency: "monthly" | "quarterly" | "annual";
  /** Days after the period end that the return is due. */
  dueDays?: number;
  /** Anchor used when the org has no GST registration date. */
  anchorMonth?: number;
}

/** Current / non-current grouping for the balance sheet. */
export interface FsPresentation {
  /** Balance-sheet caption per chartAccount.subType. */
  balanceSheetCaptions: Record<string, string>;
  /** Income statement layout; ACRA's Simplified template offers only "by nature". */
  incomeStatement: "nature" | "function";
  /** Caption order within each statement, top to bottom. */
  captionOrder: {
    assets: string[];
    liabilities: string[];
    equity: string[];
    income: string[];
    expenses: string[];
  };
}

export interface TaxModule {
  /** ISO 3166-1 alpha-2. */
  country: string;
  countryName: string;
  regime: "vat" | "gst" | "us_sales_tax";
  /** What the tax is called locally: "VAT", "GST", "Sales tax". */
  taxName: string;
  /** SG: returns must be filed in the local currency (IRAS requires SGD). */
  currencyRule: "org-base" | "local";
  /** Chart-of-accounts template key (lib/db/chart-templates). */
  chartTemplate?: string;
  controlAccounts: { output: string; input?: string; suspense?: string };
  rates: ModuleRate[];
  returns: ReturnDefinition[];
  periods?: PeriodRule[];
  fsPresentation?: FsPresentation;
  xbrl?: { templates: ("sim" | "full")[]; authority: string };
}

/** One computed box. */
export interface ComputedBox {
  box: string;
  label: string;
  help?: string;
  amount: number;
  optional?: boolean;
  section?: string;
  /** Where the figure came from, for the workpaper's "source" column. */
  source: "ledger" | "documents" | "derived" | "manual" | "accounts" | "schedule";
}

/** A single line shown in the reconciliation column (never auto-posted). */
export interface ReturnReconciliation {
  label: string;
  returnAmount: number;
  ledgerAmount: number;
  delta: number;
  note?: string;
}

export interface ReturnResult {
  kind: string;
  title: string;
  authority: string;
  country: string;
  currency: string;
  basis: TaxBasis;
  period: { startDate: string; endDate: string };
  boxes: ComputedBox[];
  reconciliation: ReturnReconciliation[];
  /** Rate ids whose effective window does not cover the period (warn, never block). */
  rateWarnings: string[];
}

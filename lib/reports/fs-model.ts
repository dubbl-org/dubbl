/**
 * Financial-statement model with jurisdiction captions.
 *
 * The report routes already have account-level balances (`AccountAggregate`).
 * This turns them into the presentation an authority expects — SFRS groups the
 * balance sheet into current and non-current and the income statement by nature
 * of expense — and in a shape the XBRL emitter can map element by element
 * (`lib/reports/xbrl/mapping.ts`).
 *
 * Pure: numbers in, sections out. No database, so the caption order and the
 * current/non-current split are testable against literals.
 */
import type { AccountAggregate } from "@/lib/reports/gl-query";
import type { FsPresentation } from "@/lib/tax/types";

export type AccountType = AccountAggregate["type"];

/** One caption line inside a section. */
export interface FsCaption {
  caption: string;
  amount: number;
  /** Account codes that make up the caption, for drill-down and audit. */
  codes: string[];
}

export interface FsSection {
  caption: string;
  rows: FsCaption[];
  total: number;
}

export interface FsModel {
  assets: { current: FsSection; nonCurrent: FsSection; total: number };
  liabilities: { current: FsSection; nonCurrent: FsSection; total: number };
  equity: FsSection;
  income: FsSection;
  expenses: FsSection;
  /** Revenue − expenses, from the account balances (equity treatment excluded). */
  netProfit: number;
  /** Assets − liabilities − equity. Zero when the books balance. */
  imbalance: number;
  soce: SoceModel;
}

/** Statement of changes in equity, per SFRS 1. */
export interface SoceModel {
  rows: { caption: string; shareCapital: number; retainedEarnings: number; total: number }[];
  closing: { shareCapital: number; retainedEarnings: number; total: number };
}

/**
 * Subtags that make an asset current. Everything else with a balance is
 * non-current; the list is deliberately explicit so a new subtag defaults to
 * non-current (the conservative choice for a filing) instead of silently
 * inflating "current assets".
 */
const CURRENT_ASSET_SUBTYPES = new Set([
  "bank",
  "current",
  "receivable",
  "inventory",
  "prepaid",
  "input_vat",
  "deposit",
]);

const NON_CURRENT_ASSET_SUBTYPES = new Set([
  "fixed",
  "intangible",
  "investment",
  "non_current",
  "goodwill",
  "rou",
]);

/** Default caption when the module has none for a subtag. */
const GENERIC_CAPTIONS: Record<string, string> = {
  bank: "Cash and cash equivalents",
  current: "Other current assets",
  receivable: "Trade and other receivables",
  inventory: "Inventories",
  prepaid: "Prepayments",
  input_vat: "Input tax recoverable",
  fixed: "Property, plant and equipment",
  intangible: "Intangible assets",
  investment: "Investments",
  non_current: "Other non-current assets",
  payable: "Trade and other payables",
  output_vat: "Output tax payable",
  tax: "Tax payable",
  loan: "Loans and borrowings",
  equity: "Share capital",
  retained: "Retained earnings",
  revenue: "Revenue",
  cogs: "Cost of sales",
  operating: "Other operating expenses",
  payroll: "Employee benefits expense",
  depreciation: "Depreciation expense",
  non_operating: "Other income and expenses",
};

function captionFor(subType: string | null, presentation: FsPresentation): string {
  const key = subType ?? "";
  return (
    presentation.balanceSheetCaptions[key] ??
    GENERIC_CAPTIONS[key] ??
    (key ? key.replace(/_/g, " ") : "Other")
  );
}

/** Accumulate accounts into caption buckets, preserving first-seen order. */
function bucket(
  accounts: AccountAggregate[],
  presentation: FsPresentation,
  sign: 1 | -1 = 1
): FsCaption[] {
  const byCaption = new Map<string, FsCaption>();
  for (const a of accounts) {
    const caption = captionFor(a.subType, presentation);
    const row = byCaption.get(caption) ?? { caption, amount: 0, codes: [] };
    row.amount += sign * a.balance;
    row.codes.push(a.code);
    byCaption.set(caption, row);
  }
  return [...byCaption.values()].filter((r) => r.amount !== 0);
}

/** Order rows by the module's caption order, then alphabetically for the rest. */
function order(rows: FsCaption[], preferred: string[]): FsCaption[] {
  const rank = new Map(preferred.map((c, i) => [c, i]));
  return [...rows].sort((a, b) => {
    const ra = rank.get(a.caption) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.caption) ?? Number.MAX_SAFE_INTEGER;
    return ra === rb ? a.caption.localeCompare(b.caption) : ra - rb;
  });
}

function section(caption: string, rows: FsCaption[]): FsSection {
  return { caption, rows, total: rows.reduce((s, r) => s + r.amount, 0) };
}

export interface BuildFsModelParams {
  accounts: AccountAggregate[];
  presentation: FsPresentation;
  /** Equity balances brought forward, when a prior period is available. */
  openingEquity?: { shareCapital: number; retainedEarnings: number };
}

export function buildFsModel({
  accounts,
  presentation,
  openingEquity,
}: BuildFsModelParams): FsModel {
  const ofType = (t: AccountType) => accounts.filter((a) => a.type === t);

  const assets = ofType("asset");
  const currentAssets = assets.filter((a) =>
    CURRENT_ASSET_SUBTYPES.has(a.subType ?? "")
  );
  // Anything not explicitly current is non-current, including unknown subtags.
  const nonCurrentAssets = assets.filter(
    (a) =>
      !CURRENT_ASSET_SUBTYPES.has(a.subType ?? "") ||
      NON_CURRENT_ASSET_SUBTYPES.has(a.subType ?? "")
  );

  const liabilities = ofType("liability");
  const currentLiabilities = liabilities.filter((a) => (a.subType ?? "current") === "current");
  const nonCurrentLiabilities = liabilities.filter(
    (a) => (a.subType ?? "current") !== "current"
  );

  const equity = ofType("equity");
  const revenue = ofType("revenue");
  const expense = ofType("expense");

  const assetCurrent = section(
    "Current assets",
    order(bucket(currentAssets, presentation), presentation.captionOrder.assets)
  );
  const assetNonCurrent = section(
    "Non-current assets",
    order(bucket(nonCurrentAssets, presentation), presentation.captionOrder.assets)
  );
  const liabilityCurrent = section(
    "Current liabilities",
    order(bucket(currentLiabilities, presentation), presentation.captionOrder.liabilities)
  );
  const liabilityNonCurrent = section(
    "Non-current liabilities",
    order(bucket(nonCurrentLiabilities, presentation), presentation.captionOrder.liabilities)
  );
  const equitySection = section(
    "Equity",
    order(bucket(equity, presentation), presentation.captionOrder.equity)
  );

  const income = section(
    "Revenue",
    order(bucket(revenue, presentation), presentation.captionOrder.income)
  );
  const expenses = section(
    "Expenses",
    order(bucket(expense, presentation, -1), presentation.captionOrder.expenses)
  );
  const netProfit = income.total - expenses.total;

  const totalAssets = assetCurrent.total + assetNonCurrent.total;
  const totalLiabilities = liabilityCurrent.total + liabilityNonCurrent.total;
  // Net profit is not posted to equity until year-end close, so add it back for
  // the balance check (and for the SOCE's "profit for the year" row).
  const equityWithProfit = equitySection.total + netProfit;

  const shareCapital = equityCycleOf(equity, "share") ?? 0;
  const retainedNow =
    equitySection.rows
      .filter((r) => !/share/i.test(r.caption))
      .reduce((s, r) => s + r.amount, 0) + netProfit;
  const opening = openingEquity ?? {
    shareCapital,
    retainedEarnings: retainedNow - netProfit,
  };

  const soceRows = [
    {
      caption: "Balance at start of year",
      shareCapital: opening.shareCapital,
      retainedEarnings: opening.retainedEarnings,
      total: opening.shareCapital + opening.retainedEarnings,
    },
    {
      caption: "Profit for the year",
      shareCapital: 0,
      retainedEarnings: netProfit,
      total: netProfit,
    },
    {
      caption: "Balance at end of year",
      shareCapital,
      retainedEarnings: retainedNow,
      total: shareCapital + retainedNow,
    },
  ];

  return {
    assets: { current: assetCurrent, nonCurrent: assetNonCurrent, total: totalAssets },
    liabilities: {
      current: liabilityCurrent,
      nonCurrent: liabilityNonCurrent,
      total: totalLiabilities,
    },
    equity: equitySection,
    income,
    expenses,
    netProfit,
    imbalance: totalAssets - totalLiabilities - equityWithProfit,
    soce: {
      rows: soceRows,
      closing: { shareCapital, retainedEarnings: retainedNow, total: shareCapital + retainedNow },
    },
  };
}

/** Share-capital balance from equity accounts, if any. */
function equityCycleOf(accounts: AccountAggregate[], match: string): number | null {
  const hits = accounts.filter((a) => (a.subType ?? "").toLowerCase().includes(match));
  if (hits.length === 0) return null;
  return hits.reduce((s, a) => s + a.balance, 0);
}

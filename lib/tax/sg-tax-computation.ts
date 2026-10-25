/**
 * Singapore tax computation: the exemption ladder and capital allowances.
 *
 * Pure arithmetic — no database, no ledger. The Form C-S / ECI workpapers feed
 * a chargeable income figure in (integer cents) and print what comes back. Every
 * threshold and rate is an IRAS constant: changing one is a code change with a
 * test, not a settings toggle, because the values are statutory for the year of
 * assessment and an audit trail needs them dated.
 *
 * Rounding, once, explicitly: exemption shares are rounded DOWN to the cent
 * (`Math.floor`), so an exemption is never overstated by a fraction of a cent.
 * Straight-line allowances round down in years 1 and 2 and give the remainder to
 * the final year, so the total allowance equals the cost exactly.
 */

/** Corporate income tax rate on chargeable income (YA 2020 onwards). */
export const CORPORATE_TAX_RATE_BP = 1700;

/** Partial exemption (s43(1)): S$10,000 at 75%, next S$190,000 at 50%. */
const PARTIAL_FIRST_BAND_CENTS = 1_000_000;
const PARTIAL_SECOND_BAND_CENTS = 19_000_000;

/** Start-up exemption (s43(2)): S$100,000 at 75%, next S$100,000 at 50%. */
const STARTUP_FIRST_BAND_CENTS = 10_000_000;
const STARTUP_SECOND_BAND_CENTS = 10_000_000;

/** Low-value assets: ≤ S$5,000 each, S$30,000 of write-off per YA. */
export const LOW_VALUE_ITEM_MAX_CENTS = 500_000;
export const LOW_VALUE_POOL_CAP_CENTS = 3_000_000;

/** Straight-line life for plant and machinery this workpaper models. */
const STRAIGHT_LINE_YEARS = 3;

export interface ExemptionResult {
  /** Exempt portion of the chargeable income, cents. */
  exemptAmount: number;
  /** Chargeable income after the exemption, cents. */
  chargeableIncome: number;
}

/** Percent-of-cents share, rounded down so the exemption is never overstated. */
function share(cents: number, bp: number): number {
  return Math.floor((cents * bp) / 10000);
}

/** Chargeable income as an integral, non-negative cent amount. */
function normalizeCents(cents: number): number {
  return Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
}

function bandedExemption(
  chargeableIncomeBeforeExemption: number,
  firstBand: number,
  secondBand: number
): ExemptionResult {
  const ci = normalizeCents(chargeableIncomeBeforeExemption);
  const first = Math.min(ci, firstBand);
  const next = Math.min(Math.max(ci - firstBand, 0), secondBand);
  const exemptAmount = share(first, 7500) + share(next, 5000);
  return { exemptAmount, chargeableIncome: ci - exemptAmount };
}

/**
 * Partial tax exemption, for every company that is not in its first three years
 * of assessment. Maximum exemption S$102,500 at S$200,000 of chargeable income.
 */
export function partialExemption(
  chargeableIncomeBeforeExemption: number
): ExemptionResult {
  return bandedExemption(
    chargeableIncomeBeforeExemption,
    PARTIAL_FIRST_BAND_CENTS,
    PARTIAL_SECOND_BAND_CENTS
  );
}

/**
 * Qualifying conditions for the start-up exemption. The caller states each one;
 * this module never assumes a company qualifies. A company that fails any
 * condition gets the partial exemption above instead — deciding which of the two
 * to claim is a filing judgement, so it stays with the caller.
 */
export interface StartupExemptionInput {
  chargeableIncomeBeforeExemption: number;
  /** 1 = the company's first year of assessment. Only 1–3 can claim. */
  yearOfAssessmentIndex: number;
  /** Incorporated in Singapore. */
  incorporatedInSingapore: boolean;
  /** Tax resident in Singapore for that year of assessment. */
  taxResident: boolean;
  /** ≤20 shareholders, all individuals, or ≥10% held by one individual. */
  shareholderConditionMet: boolean;
}

export interface StartupExemptionResult extends ExemptionResult {
  qualifies: boolean;
  /** Why it does not qualify; empty when it does. */
  reason: string;
}

/**
 * Start-up tax exemption (s43(2)): S$100,000 at 75% and the next S$100,000 at
 * 50%, maximum S$125,000, available for the first three years of assessment only
 * while the company qualifies.
 */
export function startupExemption(
  input: StartupExemptionInput
): StartupExemptionResult {
  const reasons: string[] = [];
  if (!(input.yearOfAssessmentIndex >= 1 && input.yearOfAssessmentIndex <= 3)) {
    reasons.push("only the first three years of assessment qualify");
  }
  if (!input.incorporatedInSingapore) reasons.push("not incorporated in Singapore");
  if (!input.taxResident) reasons.push("not tax resident in Singapore");
  if (!input.shareholderConditionMet) reasons.push("shareholder condition not met");

  if (reasons.length > 0) {
    return {
      qualifies: false,
      exemptAmount: 0,
      chargeableIncome: normalizeCents(input.chargeableIncomeBeforeExemption),
      reason: reasons.join("; "),
    };
  }

  return {
    qualifies: true,
    reason: "",
    ...bandedExemption(
      input.chargeableIncomeBeforeExemption,
      STARTUP_FIRST_BAND_CENTS,
      STARTUP_SECOND_BAND_CENTS
    ),
  };
}

/**
 * Tax-relevant asset classes. Land and private cars get no allowance; the rest
 * are plant and machinery. Additions to the chart of accounts do not need a new
 * class — `other` follows the same 3-year line.
 */
export type AssetCategory =
  | "computer"
  | "office_equipment"
  | "furniture"
  | "renovation"
  | "other"
  | "land"
  | "private_car";

export interface CapitalAssetInput {
  /** Cost in cents. */
  cost: number;
  category: AssetCategory;
  /** Bought in the year of assessment being computed. */
  acquiredInYear: boolean;
  /** Flagged as ≤ S$5,000 for the one-year write-off; verified against `cost`. */
  isLowValue: boolean;
  /**
   * Years of allowance already claimed (0 or omitted = this is the first).
   * Needed for a second- or third-year schedule; without it an asset bought in
   * an earlier year would be written off again.
   */
  yearsAlreadyClaimed?: number;
}

export interface CapitalAssetAllowance {
  category: AssetCategory;
  cost: number;
  /** Allowance claimable this year of assessment, cents. */
  allowanceThisYear: number;
  /** Tax written-down value carried forward after this year, cents. */
  carriedForward: number;
  /** Written off in full under the low-value pool this year. */
  writtenOff: boolean;
  /** Set when the input was adjusted: flag ignored, cap hit, or not allowable. */
  note?: string;
}

export interface CapitalAllowanceResult {
  assets: CapitalAssetAllowance[];
  /** The figure for Form C-S / ECI, cents. */
  totalAllowance: number;
  /** Closing tax written-down value, cents. */
  carriedForward: number;
  lowValuePoolUsed: number;
  lowValuePoolCap: number;
  /** Low-value cost that did not fit under the cap this year, cents. */
  lowValueDeferred: number;
  /** Cost denied any allowance (land, private cars), cents. */
  notAllowable: number;
}

const NO_ALLOWANCE: AssetCategory[] = ["land", "private_car"];

/** [year 1, year 2, year 3] allowance in cents; totals exactly to `cost`. */
function straightLineSchedule(cost: number): number[] {
  const annual = Math.floor(cost / STRAIGHT_LINE_YEARS);
  const schedule = new Array(STRAIGHT_LINE_YEARS).fill(annual);
  schedule[STRAIGHT_LINE_YEARS - 1] = cost - annual * (STRAIGHT_LINE_YEARS - 1);
  return schedule;
}

/**
 * Capital allowances for one year of assessment.
 *
 * - Low-value items (≤ S$5,000 each) are written off in full, in input order,
 *   until the S$30,000 pool for the year is used up. Anything past the cap keeps
 *   its cost as tax written-down value and is claimable in a later year — it is
 *   a deferral, not a loss.
 * - Computers, office equipment, furniture, renovation and other plant follow a
 *   3-year straight line.
 * - Land and private cars get nothing.
 *
 * s19A accelerated rates, balancing adjustments on disposal and the deferred
 * claim of allowances against future income are out of scope (say so to the
 * reviewer rather than approximating them).
 */
export function capitalAllowances(
  assets: CapitalAssetInput[]
): CapitalAllowanceResult {
  const out: CapitalAssetAllowance[] = [];
  let poolUsed = 0;
  let deferred = 0;
  let notAllowable = 0;

  for (const asset of assets) {
    const cost = normalizeCents(asset.cost);

    if (NO_ALLOWANCE.includes(asset.category)) {
      notAllowable += cost;
      out.push({
        category: asset.category,
        cost,
        allowanceThisYear: 0,
        carriedForward: 0,
        writtenOff: false,
        note:
          asset.category === "land"
            ? "No capital allowance on land."
            : "No capital allowance on private cars.",
      });
      continue;
    }

    const lowValue =
      asset.isLowValue && cost <= LOW_VALUE_ITEM_MAX_CENTS && cost > 0;
    if (asset.isLowValue && cost > LOW_VALUE_ITEM_MAX_CENTS) {
      out.push({
        category: asset.category,
        cost,
        writtenOff: false,
        note: "Low-value flag ignored: cost is above S$5,000, so the 3-year line applies.",
        ...straightLineFor(cost, asset),
      });
      continue;
    }

    if (lowValue) {
      const room = LOW_VALUE_POOL_CAP_CENTS - poolUsed;
      const claimed = Math.min(cost, Math.max(0, room));
      poolUsed += claimed;
      const remainder = cost - claimed;
      deferred += remainder;
      out.push({
        category: asset.category,
        cost,
        allowanceThisYear: claimed,
        carriedForward: remainder,
        writtenOff: remainder === 0,
        ...(remainder > 0
          ? {
              note: "S$30,000 low-value pool already used this year; the balance is claimable next year.",
            }
          : {}),
      });
      continue;
    }

    out.push({
      category: asset.category,
      cost,
      writtenOff: false,
      ...straightLineFor(cost, asset),
    });
  }

  const totalAllowance = out.reduce((s, a) => s + a.allowanceThisYear, 0);
  const carriedForward = out.reduce((s, a) => s + a.carriedForward, 0);
  return {
    assets: out,
    totalAllowance,
    carriedForward,
    lowValuePoolUsed: poolUsed,
    lowValuePoolCap: LOW_VALUE_POOL_CAP_CENTS,
    lowValueDeferred: deferred,
    notAllowable,
  };
}

/** This year's slice of the 3-year schedule and what is left afterwards. */
function straightLineFor(
  cost: number,
  asset: CapitalAssetInput
): Pick<CapitalAssetAllowance, "allowanceThisYear" | "carriedForward"> {
  const claimed = asset.acquiredInYear ? 0 : Math.max(0, asset.yearsAlreadyClaimed ?? 0);
  if (claimed >= STRAIGHT_LINE_YEARS) {
    return { allowanceThisYear: 0, carriedForward: 0 };
  }
  const schedule = straightLineSchedule(cost);
  const allowanceThisYear = schedule[claimed];
  let alreadyClaimed = 0;
  for (let i = 0; i < claimed; i++) alreadyClaimed += schedule[i];
  return {
    allowanceThisYear,
    carriedForward: cost - alreadyClaimed - allowanceThisYear,
  };
}

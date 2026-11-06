/**
 * Fixed asset depreciation calculation utilities.
 * All amounts are in integer cents.
 */

export type DepreciationMethod =
  | "straight_line"
  | "declining_balance"
  | "units_of_production"
  | "sum_of_years_digits";

export type DepreciationConvention =
  | "full_month"
  | "mid_month"
  | "half_year"
  | "mid_quarter"
  | "pro_rata_days"
  | "full_at_purchase";

/**
 * Apply a first-period timing convention to a full-period depreciation amount.
 * Conventions only ever scale the FIRST period (periodIndex 0); every other
 * period takes its full amount. When the first period is shortened, the rest
 * is recovered in one extra period after the useful life (see
 * calculateMonthlyDepreciation).
 *
 * @param amount     the full-period depreciation amount in cents
 * @param convention timing convention
 * @param periodIndex zero-based index of the period being charged
 * @param inServiceDate YYYY-MM-DD the asset was placed in service
 */
export function applyConvention(
  amount: number,
  convention: DepreciationConvention,
  periodIndex: number,
  inServiceDate: string | null | undefined
): number {
  if (amount <= 0) return 0;
  // Conventions only modify the opening period. Later months are always full.
  const isFirst = periodIndex === 0;

  switch (convention) {
    case "full_month":
      // Full month's charge regardless of in-service day.
      return amount;

    case "full_at_purchase":
      // The whole depreciable base goes in the first period. That's resolved by
      // calculateMonthlyDepreciation (it knows the remaining base); for a bare
      // periodic amount this behaves like full_month.
      return amount;

    case "mid_month":
      // Half a month's depreciation in the month of acquisition (IRS mid-month).
      return isFirst ? Math.round(amount / 2) : amount;

    case "half_year":
      // Half a year in the first AND last year of life (IRS half-year). For a
      // monthly schedule we approximate by halving the first period; the other
      // half is taken in one extra period after the useful life ends (see
      // calculateMonthlyDepreciation), so the asset still lands on residual.
      return isFirst ? Math.round(amount / 2) : amount;

    case "mid_quarter":
      // Treat the asset as placed in service mid-quarter: roughly half the
      // quarter remaining in the acquisition period.
      return isFirst ? Math.round(amount / 2) : amount;

    case "pro_rata_days": {
      // Prorate the first period by the fraction of the month in service.
      if (!isFirst || !inServiceDate) return amount;
      const d = new Date(inServiceDate + "T00:00:00Z");
      if (Number.isNaN(d.getTime())) return amount;
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const day = d.getUTCDate();
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const daysInService = daysInMonth - day + 1; // inclusive of in-service day
      return Math.round((amount * daysInService) / daysInMonth);
    }

    default:
      return amount;
  }
}

/**
 * Compute the depreciation amount for a single period.
 *
 * @param method            depreciation method
 * @param purchasePrice     original cost in cents (or revalued carrying amount)
 * @param residualValue     salvage value in cents
 * @param usefulLifeMonths  total useful life in months
 * @param periodIndex       zero-based count of periods ALREADY depreciated
 *                          (caller passes the number of existing
 *                          depreciationEntry rows — never derived from
 *                          accumulated/monthly, which is unsafe)
 * @param accumulated       accumulated depreciation so far, in cents
 * @param opts.unitsThisPeriod    units consumed this period (units_of_production)
 * @param opts.totalExpectedUnits total expected lifetime units (units_of_production)
 * @param opts.annualRateBp       declining-balance yearly rate in basis points
 *                                (2000 = 20%); when absent, double declining
 *                                balance (2 / life in years) is used
 * @param opts.finalPeriodIndex   index of the period that absorbs whatever is
 *                                left; defaults to usefulLifeMonths - 1
 * @returns the period's depreciation in cents, never taking NBV below residual
 */
export function calculateDepreciation(
  method: string,
  purchasePrice: number,
  residualValue: number,
  usefulLifeMonths: number,
  periodIndex: number,
  accumulated: number = 0,
  opts?: {
    unitsThisPeriod?: number;
    totalExpectedUnits?: number;
    annualRateBp?: number | null;
    finalPeriodIndex?: number;
  }
): number {
  const depreciableBase = purchasePrice - residualValue;
  if (depreciableBase <= 0) return 0;

  // Remaining depreciable amount — never depreciate past this.
  const remaining = depreciableBase - accumulated;
  if (remaining <= 0) return 0;

  // Units-of-production is usage-driven and independent of usefulLifeMonths.
  if (method === "units_of_production") {
    const units = opts?.unitsThisPeriod ?? 0;
    const total = opts?.totalExpectedUnits ?? 0;
    if (units <= 0 || total <= 0) return 0;
    const raw = Math.round((depreciableBase * units) / total);
    return Math.min(raw, remaining);
  }

  if (usefulLifeMonths <= 0) return 0;
  const finalPeriodIndex = opts?.finalPeriodIndex ?? usefulLifeMonths - 1;
  // Already fully depreciated by period count.
  if (periodIndex > finalPeriodIndex) return 0;

  // Final period: charge whatever remains so the schedule lands exactly on the
  // depreciable base (absorbs all accumulated rounding residual).
  if (periodIndex === finalPeriodIndex) return remaining;

  if (method === "declining_balance") {
    // A fixed yearly share of the current book value. Uses the given rate, or
    // double declining balance (twice the straight-line rate) when none is set.
    const annualRate =
      opts?.annualRateBp && opts.annualRateBp > 0
        ? opts.annualRateBp / 10000
        : 2 / (usefulLifeMonths / 12);
    const monthlyRate = annualRate / 12;
    const currentBookValue = purchasePrice - accumulated;
    if (currentBookValue <= residualValue) return 0;
    const dep = Math.round(currentBookValue * monthlyRate);
    // Never depreciate below residual value.
    return Math.min(dep, currentBookValue - residualValue);
  }

  if (method === "sum_of_years_digits") {
    // Sum-of-years'-digits on a MONTHLY schedule: the weight for each month is
    // (remaining months including this one). The denominator is the sum of all
    // month weights, n(n+1)/2 where n = usefulLifeMonths.
    const n = usefulLifeMonths;
    const denominator = (n * (n + 1)) / 2;
    if (denominator <= 0) return 0;
    const weight = Math.max(1, n - periodIndex); // months remaining including this one
    const dep = Math.round((depreciableBase * weight) / denominator);
    return Math.min(dep, remaining);
  }

  // straight_line (and default fallback): equal monthly amount.
  const dep = Math.round(depreciableBase / usefulLifeMonths);
  return Math.min(dep, remaining);
}

/**
 * True when the convention takes less than a full month in the first period,
 * so the shortfall is recovered in one extra period after the useful life.
 */
function shortensFirstPeriod(
  convention: string,
  inServiceDate: string | null | undefined
): boolean {
  if (convention === "mid_month" || convention === "half_year" || convention === "mid_quarter") {
    return true;
  }
  if (convention === "pro_rata_days" && inServiceDate) {
    // Day-by-day only shortens the first month when service starts after the 1st.
    return Number(inServiceDate.slice(8, 10)) > 1;
  }
  return false;
}

/**
 * Compute the depreciation charge for an asset's NEXT period, applying the
 * asset's first-period convention. The caller MUST pass `periodIndex` as the
 * count of existing depreciationEntry rows for the asset — this replaces the
 * old, unsafe `monthsElapsed = floor(accumulated/monthly)` heuristic, which
 * broke for declining-balance, SYD, and any uneven schedule.
 *
 * @param asset.periodIndex     count of depreciation entries already booked
 * @param asset.accumulatedDepreciation accumulated depreciation in cents
 * @param asset.unitsThisPeriod usage reading for units_of_production
 * @param asset.periodDate      YYYY-MM-DD of the period being charged (end date)
 * @param asset.depreciationRateBp declining-balance yearly rate (basis points)
 * @returns the period charge in cents
 */
export function calculateMonthlyDepreciation(asset: {
  purchasePrice: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  accumulatedDepreciation: number;
  purchaseDate: string;
  periodIndex: number;
  convention?: string;
  inServiceDate?: string | null;
  totalExpectedUnits?: number | null;
  unitsThisPeriod?: number | null;
  periodDate?: string | null;
  depreciationRateBp?: number | null;
}): number {
  const depreciableBase = asset.purchasePrice - asset.residualValue;
  if (depreciableBase <= 0) return 0;
  const remaining = depreciableBase - asset.accumulatedDepreciation;
  if (remaining <= 0) return 0;

  // Units-of-production is usage-prorated already; conventions don't apply.
  if (asset.depreciationMethod === "units_of_production") {
    return calculateDepreciation(
      asset.depreciationMethod,
      asset.purchasePrice,
      asset.residualValue,
      asset.usefulLifeMonths,
      asset.periodIndex,
      asset.accumulatedDepreciation,
      {
        unitsThisPeriod: asset.unitsThisPeriod ?? 0,
        totalExpectedUnits: asset.totalExpectedUnits ?? 0,
      }
    );
  }

  const convention = (asset.convention ?? "full_month") as DepreciationConvention;
  const inServiceDate = asset.inServiceDate ?? asset.purchaseDate;

  // Expensed in full when it's placed in service.
  if (convention === "full_at_purchase") {
    return asset.periodIndex === 0 ? remaining : 0;
  }

  // A shortened first period pushes the last charge one period later.
  const finalPeriodIndex =
    asset.usefulLifeMonths - 1 + (shortensFirstPeriod(convention, inServiceDate) ? 1 : 0);

  const raw = calculateDepreciation(
    asset.depreciationMethod,
    asset.purchasePrice,
    asset.residualValue,
    asset.usefulLifeMonths,
    asset.periodIndex,
    asset.accumulatedDepreciation,
    { annualRateBp: asset.depreciationRateBp ?? null, finalPeriodIndex }
  );
  if (raw <= 0) return 0;

  // The final period settles the remainder exactly; no convention applies.
  if (asset.periodIndex === finalPeriodIndex) return raw;

  const adjusted = applyConvention(raw, convention, asset.periodIndex, inServiceDate);

  // Never let a convention push the charge past the remaining depreciable base.
  return Math.max(0, Math.min(adjusted, remaining));
}

/** The columns of a fixed asset row the charge depends on. */
export interface DepreciableAsset {
  purchasePrice: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  accumulatedDepreciation: number;
  purchaseDate: string;
  convention: string;
  inServiceDate: string | null;
  totalExpectedUnits: number | null;
  depreciationRateBp?: number | null;
}

/**
 * The one calculation every depreciation path uses (the Record value drop
 * button, the Run depreciation button, the nightly job, disposal catch-up and
 * the MCP tools): the charge for an asset's next period.
 *
 * @param periodIndex count of depreciation entries already booked
 * @param periodDate  YYYY-MM-DD the charge is dated
 * @param unitsThisPeriod usage reading (units-of-production only)
 */
export function nextDepreciationCharge(
  asset: DepreciableAsset,
  periodIndex: number,
  periodDate: string,
  unitsThisPeriod?: number | null
): number {
  return calculateMonthlyDepreciation({
    purchasePrice: asset.purchasePrice,
    residualValue: asset.residualValue,
    usefulLifeMonths: asset.usefulLifeMonths,
    depreciationMethod: asset.depreciationMethod,
    accumulatedDepreciation: asset.accumulatedDepreciation,
    purchaseDate: asset.purchaseDate,
    periodIndex,
    convention: asset.convention,
    inServiceDate: asset.inServiceDate ?? asset.purchaseDate,
    totalExpectedUnits: asset.totalExpectedUnits,
    unitsThisPeriod: unitsThisPeriod ?? null,
    periodDate,
    depreciationRateBp: asset.depreciationRateBp ?? null,
  });
}

/** First and last day (YYYY-MM-DD) of the calendar month containing `date`. */
export function monthBounds(date: string): { start: string; end: string } {
  const [y, m] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

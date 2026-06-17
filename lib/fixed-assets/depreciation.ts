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
 * Apply a first-period (or final-period) timing convention to a full-period
 * depreciation amount. Conventions only ever scale the FIRST period (periodIndex
 * 0) or, for proration / disposal handling, the final period — every other
 * period takes its full amount.
 *
 * @param amount     the full-period depreciation amount in cents
 * @param convention timing convention
 * @param periodIndex zero-based index of the period being charged
 * @param inServiceDate YYYY-MM-DD the asset was placed in service
 * @param periodDate  YYYY-MM-DD the period being charged (its end date)
 * @param isFinal     true if this is the asset's final depreciation period
 */
export function applyConvention(
  amount: number,
  convention: DepreciationConvention,
  periodIndex: number,
  inServiceDate: string | null | undefined,
  periodDate: string | null | undefined,
  isFinal: boolean
): number {
  if (amount <= 0) return 0;
  // Conventions only modify the opening period (and, for half-year, the final
  // period). Mid-period months are always full.
  const isFirst = periodIndex === 0;

  switch (convention) {
    case "full_month":
      // Full month's charge regardless of in-service day.
      return amount;

    case "full_at_purchase":
      // Take the entire depreciable base immediately — handled by the caller via
      // the "in_service" timing, but for a periodic amount the first period gets
      // the full amount and the rest get nothing. Treated as full_month here for
      // the per-period amount; full expensing is a method-level concern.
      return amount;

    case "mid_month":
      // Half a month's depreciation in the month of acquisition (IRS mid-month).
      return isFirst ? Math.round(amount / 2) : amount;

    case "half_year":
      // Half a year in the first AND last year of life (IRS half-year). For a
      // monthly schedule we approximate by halving the first and final periods.
      return isFirst || isFinal ? Math.round(amount / 2) : amount;

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
 * @returns the period's depreciation in cents, never taking NBV below residual
 */
export function calculateDepreciation(
  method: string,
  purchasePrice: number,
  residualValue: number,
  usefulLifeMonths: number,
  periodIndex: number,
  accumulated: number = 0,
  opts?: { unitsThisPeriod?: number; totalExpectedUnits?: number }
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
  // Already fully depreciated by period count.
  if (periodIndex >= usefulLifeMonths) return 0;

  // Final period: charge whatever remains so the schedule lands exactly on the
  // depreciable base (absorbs all accumulated rounding residual).
  const isFinalPeriod = periodIndex === usefulLifeMonths - 1;
  if (isFinalPeriod) return remaining;

  if (method === "declining_balance") {
    // Double-declining balance method.
    const annualRate = 2 / (usefulLifeMonths / 12);
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
    const weight = n - periodIndex; // months remaining including this one
    const dep = Math.round((depreciableBase * weight) / denominator);
    return Math.min(dep, remaining);
  }

  // straight_line (and default fallback): equal monthly amount.
  const dep = Math.round(depreciableBase / usefulLifeMonths);
  return Math.min(dep, remaining);
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
}): number {
  const depreciableBase = asset.purchasePrice - asset.residualValue;
  if (depreciableBase <= 0) return 0;

  const raw = calculateDepreciation(
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
  if (raw <= 0) return 0;

  // Units-of-production is usage-prorated already; conventions don't apply.
  if (asset.depreciationMethod === "units_of_production") return raw;

  const isFinal =
    asset.usefulLifeMonths > 0 &&
    asset.periodIndex === asset.usefulLifeMonths - 1;

  const convention = (asset.convention ?? "full_month") as DepreciationConvention;
  const adjusted = applyConvention(
    raw,
    convention,
    asset.periodIndex,
    asset.inServiceDate ?? asset.purchaseDate,
    asset.periodDate ?? null,
    isFinal
  );

  // Never let a convention push the charge past the remaining depreciable base.
  const remaining = depreciableBase - asset.accumulatedDepreciation;
  return Math.max(0, Math.min(adjusted, remaining));
}

/**
 * Fixed asset depreciation calculation utilities.
 * All amounts are in integer cents.
 */

/**
 * Calculate monthly depreciation amount in cents.
 *
 * @param method - "straight_line" or "declining_balance"
 * @param purchasePrice - Original cost in cents
 * @param residualValue - Salvage value in cents
 * @param usefulLifeMonths - Total useful life in months
 * @param monthsElapsed - Number of months already depreciated
 * @returns Monthly depreciation amount in cents
 */
export function calculateDepreciation(
  method: string,
  purchasePrice: number,
  residualValue: number,
  usefulLifeMonths: number,
  monthsElapsed: number
): number {
  if (usefulLifeMonths <= 0) return 0;

  const depreciableBase = purchasePrice - residualValue;
  if (depreciableBase <= 0) return 0;

  // Already fully depreciated
  if (monthsElapsed >= usefulLifeMonths) return 0;

  if (method === "straight_line") {
    // Straight-line: equal monthly amount
    return Math.round(depreciableBase / usefulLifeMonths);
  }

  if (method === "declining_balance") {
    // Double-declining balance method
    const annualRate = (2 / (usefulLifeMonths / 12)) * 100; // percentage
    const monthlyRate = annualRate / 12 / 100;

    // Current book value = purchasePrice - accumulated depreciation so far
    // Accumulated = sum of previous declining balance depreciations
    let currentBookValue = purchasePrice;
    for (let i = 0; i < monthsElapsed; i++) {
      const dep = Math.round(currentBookValue * monthlyRate);
      currentBookValue -= dep;
      if (currentBookValue <= residualValue) {
        currentBookValue = residualValue;
        break;
      }
    }

    if (currentBookValue <= residualValue) return 0;

    const depreciation = Math.round(currentBookValue * monthlyRate);
    // Don't depreciate below residual value
    if (currentBookValue - depreciation < residualValue) {
      return currentBookValue - residualValue;
    }
    return depreciation;
  }

  // Default fallback to straight-line
  return Math.round(depreciableBase / usefulLifeMonths);
}

/**
 * Helper that wraps calculateDepreciation with an asset object.
 */
export function calculateMonthlyDepreciation(asset: {
  purchasePrice: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  accumulatedDepreciation: number;
  purchaseDate: string;
}): number {
  // Calculate months elapsed from accumulated depreciation vs monthly amount
  const depreciableBase = asset.purchasePrice - asset.residualValue;
  if (depreciableBase <= 0) return 0;

  // For straight-line, monthsElapsed can be derived from accumulated depreciation
  const monthlyAmount = Math.round(depreciableBase / asset.usefulLifeMonths);
  const monthsElapsed =
    monthlyAmount > 0
      ? Math.floor(asset.accumulatedDepreciation / monthlyAmount)
      : 0;

  return calculateDepreciation(
    asset.depreciationMethod,
    asset.purchasePrice,
    asset.residualValue,
    asset.usefulLifeMonths,
    monthsElapsed
  );
}

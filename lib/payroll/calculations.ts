/**
 * Shared payroll calculation utilities.
 * All monetary values are integer cents. Tax rates are basis points (2000 = 20%).
 */

interface DeductionInput {
  category: "pre_tax" | "post_tax";
  amount: number | null; // cents (fixed)
  percent: number | null; // percentage of gross
}

interface DeductionResult {
  preTax: number; // cents
  postTax: number; // cents
  total: number; // cents
}

/** Calculate total deductions from a list of active deductions */
export function calculateDeductions(
  grossAmount: number,
  deductions: DeductionInput[]
): DeductionResult {
  let preTax = 0;
  let postTax = 0;

  for (const d of deductions) {
    const amount = d.amount
      ? d.amount
      : d.percent
        ? Math.round(grossAmount * (d.percent / 100))
        : 0;

    if (d.category === "pre_tax") {
      preTax += amount;
    } else {
      postTax += amount;
    }
  }

  return { preTax, postTax, total: preTax + postTax };
}

/** Calculate tax using basis points rate (simple flat rate) */
export function calculateTaxBasisPoints(
  taxableAmount: number,
  rateBasisPoints: number
): number {
  return Math.round((taxableAmount * rateBasisPoints) / 10000);
}

interface TaxBracket {
  minIncome: number; // cents (annual)
  maxIncome: number | null; // cents
  rate: number; // basis points
}

/** Calculate tax using progressive brackets (annual amounts) */
export function calculateBracketTax(
  annualIncome: number,
  brackets: TaxBracket[]
): number {
  const sorted = [...brackets].sort((a, b) => a.minIncome - b.minIncome);
  let totalTax = 0;

  for (const bracket of sorted) {
    if (annualIncome <= bracket.minIncome) break;

    const upper = bracket.maxIncome ?? Infinity;
    const taxable = Math.min(annualIncome, upper) - bracket.minIncome;
    if (taxable > 0) {
      totalTax += Math.round((taxable * bracket.rate) / 10000);
    }
  }

  return totalTax;
}

/** Calculate gross pay for one period from annual salary */
export function periodGross(
  annualSalary: number,
  frequency: string
): number {
  switch (frequency) {
    case "weekly":
      return Math.round(annualSalary / 52);
    case "biweekly":
      return Math.round(annualSalary / 26);
    case "monthly":
    default:
      return Math.round(annualSalary / 12);
  }
}

/** Full payroll item calculation with deductions */
export function calculatePayrollItem(params: {
  grossAmount: number;
  taxRateBasisPoints: number;
  deductions: DeductionInput[];
}): {
  grossAmount: number;
  preTaxDeductions: number;
  taxableIncome: number;
  taxAmount: number;
  postTaxDeductions: number;
  totalDeductions: number;
  netAmount: number;
} {
  const { grossAmount, taxRateBasisPoints, deductions: deds } = params;

  const deductionResult = calculateDeductions(grossAmount, deds);
  const taxableIncome = grossAmount - deductionResult.preTax;
  const taxAmount = calculateTaxBasisPoints(taxableIncome, taxRateBasisPoints);
  const totalDeductions = deductionResult.preTax + taxAmount + deductionResult.postTax;
  const netAmount = grossAmount - totalDeductions;

  return {
    grossAmount,
    preTaxDeductions: deductionResult.preTax,
    taxableIncome,
    taxAmount,
    postTaxDeductions: deductionResult.postTax,
    totalDeductions,
    netAmount,
  };
}

// ─── Per-deduction lines for a pay item ─────────────────────────────

/** An employee's assigned deduction, with its type's defaults. */
export interface AssignedDeduction {
  deductionTypeId: string;
  name: string;
  category: "pre_tax" | "post_tax";
  /** Employee override, cents. */
  amount: number | null;
  /** Employee override, percent of gross (e.g. 5 = 5%). */
  percent: number | null;
  defaultAmount: number | null;
  defaultPercent: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface DeductionLine {
  deductionTypeId: string;
  name: string;
  category: "pre_tax" | "post_tax";
  amount: number; // cents
}

/**
 * Turn an employee's assigned deductions into the lines withheld from one pay
 * item. The employee's own amount or percent wins over the type's default; a
 * deduction whose start/end dates don't overlap the pay period is skipped.
 * Pre-tax lines can never add up to more than gross.
 */
export function computeDeductionLines(
  grossAmount: number,
  deductions: AssignedDeduction[],
  periodStart: string,
  periodEnd: string
): DeductionLine[] {
  const lines: DeductionLine[] = [];
  for (const d of deductions) {
    if (d.startDate && d.startDate > periodEnd) continue;
    if (d.endDate && d.endDate < periodStart) continue;

    let amount = 0;
    if (d.amount != null) amount = d.amount;
    else if (d.percent != null) amount = Math.round((grossAmount * d.percent) / 100);
    else if (d.defaultAmount != null) amount = d.defaultAmount;
    else if (d.defaultPercent != null) amount = Math.round((grossAmount * d.defaultPercent) / 100);
    if (amount <= 0) continue;

    lines.push({ deductionTypeId: d.deductionTypeId, name: d.name, category: d.category, amount });
  }

  const preTax = lines.filter((l) => l.category === "pre_tax");
  const postTax = lines.filter((l) => l.category === "post_tax");
  return [...capLines(preTax, Math.max(0, grossAmount)), ...postTax];
}

/**
 * Trim lines, in order, so they add up to no more than `limit` cents. Lines
 * that end up at 0 are dropped. Used to stop deductions pushing take-home pay
 * below zero.
 */
export function capLines<T extends { amount: number }>(lines: T[], limit: number): T[] {
  let room = Math.max(0, limit);
  const out: T[] = [];
  for (const l of lines) {
    const amount = Math.min(l.amount, room);
    room -= amount;
    if (amount > 0) out.push({ ...l, amount });
  }
  return out;
}

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

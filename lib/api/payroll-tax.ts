/**
 * Pure payroll-tax math — no DB access, so it is fully unit-testable.
 *
 * All monetary amounts are integer cents. Rates are basis points
 * (10000 bp = 100%). Every result is rounded to whole cents with Math.round
 * and guarded against divide-by-zero / negative inputs.
 *
 * The progressive engine implements the IRS Pub 15-T "Percentage Method":
 *   1. Annualize the period wage (periodWage × payPeriodsPerYear).
 *   2. Subtract the standard deduction and the value of withholding allowances
 *      to get the annual taxable wage.
 *   3. Walk the MARGINAL brackets to get the tentative annual tax:
 *        tax = baseAmountCents + (annualWage − bracketFloor) × rate
 *      where baseAmountCents is the cumulative tax on all lower brackets
 *      (Pub 15-T column C). When baseAmountCents is not supplied it is derived
 *      by summing the lower brackets.
 *   4. Divide by payPeriodsPerYear to get the per-period withholding and add
 *      any flat additional withholding the employee elected.
 */

/** One marginal tax bracket. Mirrors the persisted taxBracket row shape. */
export interface MarginalBracket {
  /** Annual bracket floor in cents (inclusive). */
  minIncome: number;
  /** Annual bracket ceiling in cents (exclusive). null = no upper limit. */
  maxIncome?: number | null;
  /** Marginal rate in basis points (e.g. 2200 = 22%). */
  rate: number;
  /**
   * Cumulative tax on all income below minIncome, in cents (Pub 15-T col C).
   * When null/undefined the engine derives it from the lower brackets so a
   * schedule that only lists floor + rate still computes correctly.
   */
  baseAmountCents?: number | null;
}

export interface ComputePeriodWithholdingInput {
  /**
   * Annualized taxable wage in cents BEFORE the standard deduction and
   * allowances are removed (typically periodWage × payPeriodsPerYear).
   */
  annualTaxableWage: number;
  /** Marginal brackets for the employee's jurisdiction / filing status / year. */
  brackets: MarginalBracket[];
  /** Filing status — accepted for symmetry/logging; bracket selection is the caller's job. */
  filingStatus?: string | null;
  /** Number of pay periods in a year (e.g. 12 monthly, 26 biweekly, 52 weekly). */
  payPeriodsPerYear: number;
  /** Number of withholding allowances claimed. */
  allowances?: number;
  /** Annual value of one allowance, in cents. */
  allowanceValueCents?: number;
  /** Annual standard deduction, in cents. */
  standardDeductionCents?: number;
  /** Flat extra amount the employee elected to withhold each period, in cents. */
  additionalWithholding?: number;
}

export interface PeriodWithholdingResult {
  /** Withholding for THIS pay period, in cents (includes additionalWithholding). */
  periodWithholding: number;
  /** Tentative tax for the whole year, in cents (before dividing by periods). */
  annualTax: number;
  /** Annual wage after standard deduction + allowances, in cents (never negative). */
  taxableAfterDeductions: number;
}

/**
 * Sort brackets by floor and back-fill each bracket's cumulative base
 * (Pub 15-T col C) when the caller did not supply it, so callers can pass a
 * bare floor+rate schedule.
 */
interface NormalizedBracket {
  minIncome: number;
  maxIncome: number | null;
  rate: number;
  baseAmountCents: number;
}

function normalizeBrackets(brackets: MarginalBracket[]): NormalizedBracket[] {
  const sorted = [...brackets]
    .filter((b) => Number.isFinite(b.minIncome) && b.rate >= 0)
    .sort((a, b) => a.minIncome - b.minIncome);

  const out: NormalizedBracket[] = [];

  let derivedBase = 0;
  let prevFloor = 0;
  let prevRate = 0;
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (i > 0) {
      // Tax accrued across the previous bracket band up to this floor.
      derivedBase += Math.round(((b.minIncome - prevFloor) * prevRate) / 10000);
    }
    out.push({
      minIncome: b.minIncome,
      maxIncome: b.maxIncome ?? null,
      rate: b.rate,
      baseAmountCents: b.baseAmountCents ?? derivedBase,
    });
    prevFloor = b.minIncome;
    prevRate = b.rate;
  }
  return out;
}

/**
 * Compute the per-period income-tax withholding using marginal brackets.
 * Returns zeros (not negatives) when there is no taxable wage or no brackets.
 */
export function computePeriodWithholding(
  input: ComputePeriodWithholdingInput
): PeriodWithholdingResult {
  const periods =
    input.payPeriodsPerYear > 0 ? input.payPeriodsPerYear : 1; // guard /0
  const allowances = Math.max(0, input.allowances ?? 0);
  const allowanceValue = Math.max(0, input.allowanceValueCents ?? 0);
  const stdDeduction = Math.max(0, input.standardDeductionCents ?? 0);
  const additional = Math.max(0, input.additionalWithholding ?? 0);

  const annualWage = Math.max(0, input.annualTaxableWage);
  const taxableAfterDeductions = Math.max(
    0,
    annualWage - stdDeduction - allowances * allowanceValue
  );

  const brackets = normalizeBrackets(input.brackets);
  if (brackets.length === 0 || taxableAfterDeductions === 0) {
    return {
      periodWithholding: additional,
      annualTax: 0,
      taxableAfterDeductions,
    };
  }

  // Find the highest bracket whose floor the wage reaches.
  let chosen = brackets[0];
  for (const b of brackets) {
    if (taxableAfterDeductions >= b.minIncome) chosen = b;
    else break;
  }

  const annualTax = Math.max(
    0,
    chosen.baseAmountCents +
      Math.round(((taxableAfterDeductions - chosen.minIncome) * chosen.rate) / 10000)
  );

  const periodWithholding = Math.round(annualTax / periods) + additional;

  return { periodWithholding, annualTax, taxableAfterDeductions };
}

export interface ComputeFicaInput {
  /** Taxable wage for THIS period, in cents. */
  periodWage: number;
  /** Year-to-date wage BEFORE this period, in cents. */
  ytdWage: number;
  /** Annual Social Security wage base cap, in cents. */
  ssWageBaseCents: number;
  /** Social Security rate in basis points (e.g. 620 = 6.2%). */
  ssRateBp: number;
  /** Medicare rate in basis points (e.g. 145 = 1.45%). */
  medicareRateBp: number;
  /** YTD wage threshold over which Additional Medicare applies, in cents. */
  addlMedicareThresholdCents: number;
  /** Additional Medicare rate in basis points (e.g. 90 = 0.9%). */
  addlMedicareRateBp: number;
}

export interface FicaResult {
  /** Employee Social Security withheld this period, in cents (capped at wage base). */
  socialSecurity: number;
  /** Employee Medicare withheld this period, in cents (uncapped). */
  medicare: number;
  /** Additional Medicare (0.9%) on YTD wages over the threshold, in cents. */
  additionalMedicare: number;
  /** Sum of all three, in cents. */
  total: number;
}

/**
 * Compute the employee-side FICA withholding for one pay period.
 *   • Social Security: ssRateBp on wages up to the annual wage base. Once YTD
 *     wages reach the base, no further SS is withheld; a period that straddles
 *     the base is taxed only on the portion below it.
 *   • Medicare: medicareRateBp on the full period wage (no cap).
 *   • Additional Medicare: addlMedicareRateBp on the portion of YTD wages above
 *     the threshold that falls in THIS period.
 */
export function computeFica(input: ComputeFicaInput): FicaResult {
  const periodWage = Math.max(0, input.periodWage);
  const ytdWage = Math.max(0, input.ytdWage);

  // Social Security: only the slice of this period's wage that is still below
  // the annual wage base is taxed.
  const ssBase = Math.max(0, input.ssWageBaseCents);
  const remainingSsRoom = Math.max(0, ssBase - ytdWage);
  const ssTaxable = Math.min(periodWage, remainingSsRoom);
  const socialSecurity = Math.round((ssTaxable * Math.max(0, input.ssRateBp)) / 10000);

  // Medicare: uncapped on the full period wage.
  const medicare = Math.round((periodWage * Math.max(0, input.medicareRateBp)) / 10000);

  // Additional Medicare: the part of THIS period's wage that pushes cumulative
  // wages above the threshold.
  const threshold = Math.max(0, input.addlMedicareThresholdCents);
  const newYtd = ytdWage + periodWage;
  const addlTaxable = Math.max(0, newYtd - Math.max(ytdWage, threshold));
  const additionalMedicare = Math.round(
    (addlTaxable * Math.max(0, input.addlMedicareRateBp)) / 10000
  );

  const total = socialSecurity + medicare + additionalMedicare;
  return { socialSecurity, medicare, additionalMedicare, total };
}

export interface ComputeEmployerTaxesInput {
  /** Taxable wage for THIS period, in cents. */
  periodWage: number;
  /** Year-to-date wage BEFORE this period, in cents. */
  ytdWage: number;
  /** When true, employer matches employee Social Security + Medicare. */
  employerFicaEnabled: boolean;
  /** Annual Social Security wage base cap, in cents. */
  ssWageBaseCents: number;
  /** Employer Social Security rate in basis points (typically 620 = 6.2%). */
  ssRateBp: number;
  /** Employer Medicare rate in basis points (typically 145 = 1.45%, no employer Additional Medicare). */
  medicareRateBp: number;
  /** FUTA rate in basis points (e.g. 60 = 0.6%). */
  futaRateBp: number;
  /** Annual FUTA wage base cap, in cents (e.g. 700000 = $7,000). */
  futaWageBaseCents: number;
  /** SUTA rate in basis points. */
  sutaRateBp: number;
  /** Annual SUTA wage base cap, in cents. */
  sutaWageBaseCents: number;
}

export interface EmployerTaxResult {
  /** Employer Social Security match this period, in cents (capped at wage base). */
  socialSecurity: number;
  /** Employer Medicare match this period, in cents (uncapped, no additional medicare). */
  medicare: number;
  /** FUTA this period, in cents (capped at FUTA wage base). */
  futa: number;
  /** SUTA this period, in cents (capped at SUTA wage base). */
  suta: number;
  /** Sum of all employer taxes, in cents. */
  total: number;
}

/**
 * Compute the EMPLOYER-side payroll taxes for one pay period. These are an
 * expense to the company on top of gross wages (they do NOT reduce employee net
 * pay):
 *   • Employer FICA (when enabled): matches employee SS (capped at the wage
 *     base) and Medicare (uncapped). There is no employer Additional Medicare.
 *   • FUTA / SUTA: unemployment taxes on the slice of this period's wage still
 *     below the respective annual wage base.
 * Every component taxes only the portion of the period wage that remains below
 * its cap given YTD wages, mirroring computeFica's straddle handling.
 */
export function computeEmployerTaxes(
  input: ComputeEmployerTaxesInput
): EmployerTaxResult {
  const periodWage = Math.max(0, input.periodWage);
  const ytdWage = Math.max(0, input.ytdWage);

  const cappedTax = (wageBaseCents: number, rateBp: number): number => {
    const base = Math.max(0, wageBaseCents);
    const room = Math.max(0, base - ytdWage);
    const taxable = Math.min(periodWage, room);
    return Math.round((taxable * Math.max(0, rateBp)) / 10000);
  };

  let socialSecurity = 0;
  let medicare = 0;
  if (input.employerFicaEnabled) {
    socialSecurity = cappedTax(input.ssWageBaseCents, input.ssRateBp);
    // Medicare is uncapped.
    medicare = Math.round((periodWage * Math.max(0, input.medicareRateBp)) / 10000);
  }

  const futa = cappedTax(input.futaWageBaseCents, input.futaRateBp);
  const suta = cappedTax(input.sutaWageBaseCents, input.sutaRateBp);

  const total = socialSecurity + medicare + futa + suta;
  return { socialSecurity, medicare, futa, suta, total };
}

/** Map a payFrequency enum value to the number of pay periods per year. */
export function payPeriodsPerYear(payFrequency: string): number {
  switch (payFrequency) {
    case "weekly":
      return 52;
    case "biweekly":
      return 26;
    case "monthly":
    default:
      return 12;
  }
}

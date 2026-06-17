/**
 * DB-aware orchestration around the pure payroll-tax math (lib/api/payroll-tax.ts).
 *
 * This module loads the persisted tax configuration for an employee
 * (employeeTaxConfig, the active taxBracket schedule for their jurisdiction /
 * filing status / year, and taxAllowanceConfig) plus the org FICA/employer
 * parameters from payrollSettings, then produces the full per-period
 * withholding + employer-tax breakdown that the run routes persist into
 * payrollItemTaxBreakdown / payrollItemEmployerTax.
 *
 * All amounts are integer cents; rates are basis points. Everything here is
 * org-scoped — every query filters by organizationId.
 */
import { db } from "@/lib/db";
import {
  payrollEmployee,
  payrollItem,
  payrollRun,
  taxBracket,
  taxAllowanceConfig,
  employeeTaxConfig,
  type payrollSettings,
} from "@/lib/db/schema";
import { eq, and, lt, gte, inArray } from "drizzle-orm";
import {
  computePeriodWithholding,
  computeFica,
  computeEmployerTaxes,
  payPeriodsPerYear,
  type MarginalBracket,
} from "@/lib/api/payroll-tax";

type DbOrTx = typeof db | Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

type PayrollSettingsRow = typeof payrollSettings.$inferSelect;
type EmployeeRow = typeof payrollEmployee.$inferSelect;

/** One per-jurisdiction/per-kind employee withholding line (→ payrollItemTaxBreakdown). */
export interface TaxBreakdownLine {
  jurisdictionLevel: "federal" | "state" | "local";
  jurisdiction: string | null;
  taxKind: string; // "income_tax" | "social_security" | "medicare" | "additional_medicare"
  amount: number; // cents
}

/** One per-jurisdiction/per-kind employer tax line (→ payrollItemEmployerTax). */
export interface EmployerTaxLine {
  jurisdictionLevel: "federal" | "state" | "local";
  jurisdiction: string | null;
  taxKind: string; // "employer_social_security" | "employer_medicare" | "futa" | "suta"
  amount: number; // cents
}

export interface EmployeeWithholding {
  /** Total employee tax withheld this period (income tax + FICA), cents. */
  totalTax: number;
  /** Per-line employee withholding breakdown, to persist into payrollItemTaxBreakdown. */
  breakdown: TaxBreakdownLine[];
  /** Per-line employer tax breakdown, to persist into payrollItemEmployerTax. */
  employerBreakdown: EmployerTaxLine[];
}

/**
 * Sum an employee's YTD taxable wage (gross less pre-tax deductions) from all
 * payroll items in completed/processing runs whose pay-period END falls in the
 * same calendar year and STRICTLY BEFORE the current period's start — i.e. the
 * wages already taxed before this run. Drafts and voided runs are excluded.
 */
export async function getEmployeeYtdWage(
  organizationId: string,
  employeeId: string,
  periodStart: string,
  exec: DbOrTx = db
): Promise<number> {
  const year = new Date(periodStart).getUTCFullYear();
  const yearStart = `${year}-01-01`;

  // Prior runs in the SAME calendar year whose period ended before this one.
  const runs = await exec
    .select({ id: payrollRun.id })
    .from(payrollRun)
    .where(
      and(
        eq(payrollRun.organizationId, organizationId),
        inArray(payrollRun.status, ["completed", "processing"]),
        gte(payrollRun.payPeriodEnd, yearStart),
        lt(payrollRun.payPeriodEnd, periodStart)
      )
    );

  const runIds = runs.map((r) => r.id);
  if (runIds.length === 0) return 0;

  const items = await exec
    .select({
      grossAmount: payrollItem.grossAmount,
      preTaxDeductions: payrollItem.preTaxDeductions,
    })
    .from(payrollItem)
    .where(
      and(
        eq(payrollItem.employeeId, employeeId),
        inArray(payrollItem.payrollRunId, runIds)
      )
    );

  return items.reduce(
    (sum, it) => sum + Math.max(0, it.grossAmount - (it.preTaxDeductions ?? 0)),
    0
  );
}

/**
 * Load the active marginal bracket schedule for a jurisdiction/filing status/
 * year, ordered by floor. filingStatus rows that are null apply to every status.
 * Falls back to brackets with a null taxYear when no year-specific set exists.
 */
async function loadBrackets(
  organizationId: string,
  jurisdictionLevel: "federal" | "state" | "local",
  jurisdiction: string | null,
  filingStatus: string,
  taxYear: number | null,
  exec: DbOrTx
): Promise<MarginalBracket[]> {
  const rows = await exec
    .select({
      minIncome: taxBracket.minIncome,
      maxIncome: taxBracket.maxIncome,
      rate: taxBracket.rate,
      baseAmountCents: taxBracket.baseAmountCents,
      filingStatus: taxBracket.filingStatus,
      taxYear: taxBracket.taxYear,
    })
    .from(taxBracket)
    .where(
      and(
        eq(taxBracket.organizationId, organizationId),
        eq(taxBracket.jurisdictionLevel, jurisdictionLevel),
        eq(taxBracket.isActive, true)
      )
    );

  // Filter in memory: filing status (null = applies to all statuses), then
  // prefer the requested tax year, else fall back to year-agnostic rows.
  void jurisdiction;
  const byStatus = rows.filter(
    (r) => r.filingStatus == null || r.filingStatus === filingStatus
  );

  const yearMatch = byStatus.filter((r) => r.taxYear === taxYear);
  const chosen = yearMatch.length > 0 ? yearMatch : byStatus.filter((r) => r.taxYear == null);

  return chosen.map((r) => ({
    minIncome: r.minIncome,
    maxIncome: r.maxIncome,
    rate: r.rate,
    baseAmountCents: r.baseAmountCents,
  }));
}

/** Load the allowance/standard-deduction config for a jurisdiction + year. */
async function loadAllowanceConfig(
  organizationId: string,
  jurisdictionLevel: "federal" | "state" | "local",
  taxYear: number,
  exec: DbOrTx
): Promise<{ allowanceValueCents: number; standardDeductionCents: number }> {
  const rows = await exec
    .select({
      allowanceValueCents: taxAllowanceConfig.allowanceValueCents,
      standardDeductionCents: taxAllowanceConfig.standardDeductionCents,
      taxYear: taxAllowanceConfig.taxYear,
    })
    .from(taxAllowanceConfig)
    .where(
      and(
        eq(taxAllowanceConfig.organizationId, organizationId),
        eq(taxAllowanceConfig.jurisdictionLevel, jurisdictionLevel)
      )
    );
  const exact = rows.find((r) => r.taxYear === taxYear) ?? rows[0];
  return {
    allowanceValueCents: exact?.allowanceValueCents ?? 0,
    standardDeductionCents: exact?.standardDeductionCents ?? 0,
  };
}

/**
 * Compute the full employee + employer payroll-tax breakdown for one pay period.
 *
 * @param taxableIncome period taxable wage in cents (gross less pre-tax deductions)
 * @param ytdWage employee YTD taxable wage BEFORE this period, in cents
 *
 * When no progressive brackets are configured for the org, the income-tax line
 * falls back to the employee's flat taxRate (basis points) so existing orgs keep
 * working until they load a real schedule.
 */
export async function computeEmployeeWithholding(
  organizationId: string,
  emp: EmployeeRow,
  settings: PayrollSettingsRow | undefined,
  taxableIncome: number,
  ytdWage: number,
  periodStart: string,
  exec: DbOrTx = db
): Promise<EmployeeWithholding> {
  const breakdown: TaxBreakdownLine[] = [];
  const employerBreakdown: EmployerTaxLine[] = [];

  const periods = payPeriodsPerYear(emp.payFrequency);
  const year =
    settings?.defaultTaxYear ?? new Date(periodStart).getUTCFullYear();

  // Per-employee tax election (filing status, allowances, exempt, extra w/h).
  const taxCfg = await exec.query.employeeTaxConfig.findFirst({
    where: eq(employeeTaxConfig.employeeId, emp.id),
  });
  const filingStatus = taxCfg?.filingStatus ?? "single";
  const exempt = taxCfg?.exempt ?? false;

  // ── Federal income tax (progressive) ──────────────────────────────
  let incomeTax = 0;
  if (!exempt) {
    const brackets = await loadBrackets(
      organizationId,
      "federal",
      null,
      filingStatus,
      year,
      exec
    );

    if (brackets.length > 0) {
      const allowanceCfg = await loadAllowanceConfig(
        organizationId,
        "federal",
        year,
        exec
      );
      const fed = computePeriodWithholding({
        annualTaxableWage: taxableIncome * periods,
        brackets,
        filingStatus,
        payPeriodsPerYear: periods,
        allowances: taxCfg?.federalAllowances ?? 0,
        allowanceValueCents: allowanceCfg.allowanceValueCents,
        standardDeductionCents: allowanceCfg.standardDeductionCents,
        additionalWithholding: taxCfg?.additionalWithholding ?? 0,
      });
      incomeTax = fed.periodWithholding;
    } else {
      // No bracket schedule loaded yet → keep the legacy flat-rate behavior so
      // we never silently withhold zero income tax for un-migrated orgs.
      incomeTax = Math.round((taxableIncome * emp.taxRate) / 10000);
    }
  }

  if (incomeTax > 0) {
    breakdown.push({
      jurisdictionLevel: "federal",
      jurisdiction: null,
      taxKind: "income_tax",
      amount: incomeTax,
    });
  }

  // ── Employee FICA ─────────────────────────────────────────────────
  // Only when the org has FICA params (defaults are populated on the settings
  // row). If there is no settings row at all, skip FICA rather than guessing.
  if (settings && !exempt) {
    const fica = computeFica({
      periodWage: taxableIncome,
      ytdWage,
      ssWageBaseCents: settings.ssWageBaseCents,
      ssRateBp: settings.ssRateBp,
      medicareRateBp: settings.medicareRateBp,
      addlMedicareThresholdCents: settings.addlMedicareThresholdCents,
      addlMedicareRateBp: settings.addlMedicareRateBp,
    });
    if (fica.socialSecurity > 0)
      breakdown.push({ jurisdictionLevel: "federal", jurisdiction: null, taxKind: "social_security", amount: fica.socialSecurity });
    if (fica.medicare > 0)
      breakdown.push({ jurisdictionLevel: "federal", jurisdiction: null, taxKind: "medicare", amount: fica.medicare });
    if (fica.additionalMedicare > 0)
      breakdown.push({ jurisdictionLevel: "federal", jurisdiction: null, taxKind: "additional_medicare", amount: fica.additionalMedicare });

    // ── Employer-side taxes ─────────────────────────────────────────
    const employer = computeEmployerTaxes({
      periodWage: taxableIncome,
      ytdWage,
      employerFicaEnabled: settings.employerFicaEnabled,
      ssWageBaseCents: settings.ssWageBaseCents,
      ssRateBp: settings.ssRateBp,
      medicareRateBp: settings.medicareRateBp,
      futaRateBp: settings.futaRateBp,
      futaWageBaseCents: settings.futaWageBaseCents,
      sutaRateBp: settings.sutaRateBp,
      sutaWageBaseCents: settings.sutaWageBaseCents,
    });
    if (employer.socialSecurity > 0)
      employerBreakdown.push({ jurisdictionLevel: "federal", jurisdiction: null, taxKind: "employer_social_security", amount: employer.socialSecurity });
    if (employer.medicare > 0)
      employerBreakdown.push({ jurisdictionLevel: "federal", jurisdiction: null, taxKind: "employer_medicare", amount: employer.medicare });
    if (employer.futa > 0)
      employerBreakdown.push({ jurisdictionLevel: "federal", jurisdiction: null, taxKind: "futa", amount: employer.futa });
    if (employer.suta > 0)
      employerBreakdown.push({ jurisdictionLevel: "state", jurisdiction: null, taxKind: "suta", amount: employer.suta });
  }

  const totalTax = breakdown.reduce((s, b) => s + b.amount, 0);

  return { totalTax, breakdown, employerBreakdown };
}

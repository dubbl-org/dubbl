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
  payrollSettings,
  taxBracket,
  taxAllowanceConfig,
  employeeTaxConfig,
} from "@/lib/db/schema";
import { eq, and, lt, gte, inArray, isNull } from "drizzle-orm";
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
 * The org's payroll settings row, created with the schema defaults (2026 FICA
 * rates and wage bases, FUTA, overtime rules) when it doesn't exist yet. Pay
 * runs used to skip Social Security and Medicare entirely until someone opened
 * payroll Settings, because that page was the only thing creating the row.
 */
export async function resolvePayrollSettings(
  organizationId: string,
  exec: DbOrTx = db
): Promise<PayrollSettingsRow> {
  const existing = await exec.query.payrollSettings.findFirst({
    where: eq(payrollSettings.organizationId, organizationId),
  });
  if (existing) return existing;
  await exec
    .insert(payrollSettings)
    .values({ organizationId })
    .onConflictDoNothing({ target: payrollSettings.organizationId });
  const created = await exec.query.payrollSettings.findFirst({
    where: eq(payrollSettings.organizationId, organizationId),
  });
  if (!created) throw new Error("Could not load payroll settings");
  return created;
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
 * Pick the bracket rows that apply to one employee for a jurisdiction level.
 * Pure, so the selection rules are unit-testable:
 *   - filing status: rows with a null filingStatus apply to every status;
 *   - jurisdiction: rows for the employee's own code (e.g. "CA") win, then rows
 *     with no jurisdiction (an org-wide schedule). An employee with no code set
 *     falls back to the only schedule there is when every row names the same
 *     jurisdiction (a single-state business);
 *   - year: rows for the requested tax year win over year-agnostic rows.
 */
export function selectBracketRows<
  T extends { jurisdiction: string | null; filingStatus: string | null; taxYear: number | null },
>(rows: T[], employeeCode: string | null, filingStatus: string, taxYear: number | null): T[] {
  const byStatus = rows.filter(
    (r) => r.filingStatus == null || r.filingStatus === filingStatus
  );

  const code = employeeCode?.trim().toUpperCase() || null;
  let byPlace: T[] = [];
  if (code) {
    byPlace = byStatus.filter((r) => r.jurisdiction?.trim().toUpperCase() === code);
  }
  if (byPlace.length === 0) {
    byPlace = byStatus.filter((r) => r.jurisdiction == null || r.jurisdiction.trim() === "");
  }
  if (byPlace.length === 0 && !code) {
    const codes = new Set(byStatus.map((r) => r.jurisdiction?.trim().toUpperCase()));
    if (codes.size === 1) byPlace = byStatus;
  }

  const yearMatch = byPlace.filter((r) => r.taxYear === taxYear);
  return yearMatch.length > 0 ? yearMatch : byPlace.filter((r) => r.taxYear == null);
}

/**
 * Load the active marginal bracket schedule for a jurisdiction level, the
 * employee's jurisdiction code, filing status and year, ordered by floor.
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
      jurisdiction: taxBracket.jurisdiction,
    })
    .from(taxBracket)
    .where(
      and(
        eq(taxBracket.organizationId, organizationId),
        eq(taxBracket.jurisdictionLevel, jurisdictionLevel),
        eq(taxBracket.isActive, true),
        isNull(taxBracket.deletedAt)
      )
    );

  // Federal schedules are national, so the employee's code doesn't apply.
  const chosen = selectBracketRows(
    rows,
    jurisdictionLevel === "federal" ? null : jurisdiction,
    filingStatus,
    taxYear
  );

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
  jurisdiction: string | null,
  taxYear: number,
  exec: DbOrTx
): Promise<{ allowanceValueCents: number; standardDeductionCents: number }> {
  const rows = await exec
    .select({
      allowanceValueCents: taxAllowanceConfig.allowanceValueCents,
      standardDeductionCents: taxAllowanceConfig.standardDeductionCents,
      taxYear: taxAllowanceConfig.taxYear,
      jurisdiction: taxAllowanceConfig.jurisdiction,
    })
    .from(taxAllowanceConfig)
    .where(
      and(
        eq(taxAllowanceConfig.organizationId, organizationId),
        eq(taxAllowanceConfig.jurisdictionLevel, jurisdictionLevel),
        isNull(taxAllowanceConfig.deletedAt)
      )
    );
  const code = jurisdictionLevel === "federal" ? null : jurisdiction?.trim().toUpperCase() || null;
  const own = code ? rows.filter((r) => r.jurisdiction?.trim().toUpperCase() === code) : [];
  const pool = own.length > 0 ? own : rows.filter((r) => !r.jurisdiction);
  const exact = pool.find((r) => r.taxYear === taxYear) ?? pool[0];
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
 * Income tax is worked out per level: federal, then state and local when the
 * org has loaded a schedule for the employee's state/local code (see
 * selectBracketRows). When no federal brackets are configured, federal income
 * tax falls back to the employee's flat taxRate (basis points) so existing orgs
 * keep working until they load a real schedule. A W-4 "exempt" employee has no
 * income tax withheld, but still pays Social Security and Medicare.
 */
export async function computeEmployeeWithholding(
  organizationId: string,
  emp: EmployeeRow,
  settingsRow: PayrollSettingsRow | undefined,
  taxableIncome: number,
  ytdWage: number,
  periodStart: string,
  exec: DbOrTx = db
): Promise<EmployeeWithholding> {
  const breakdown: TaxBreakdownLine[] = [];
  const employerBreakdown: EmployerTaxLine[] = [];
  const settings = settingsRow ?? (await resolvePayrollSettings(organizationId, exec));

  const periods = payPeriodsPerYear(emp.payFrequency);
  const year =
    settings.defaultTaxYear ?? new Date(periodStart).getUTCFullYear();

  // Per-employee tax election (filing status, allowances, exempt, extra w/h).
  const taxCfg = await exec.query.employeeTaxConfig.findFirst({
    where: eq(employeeTaxConfig.employeeId, emp.id),
  });
  const filingStatus = taxCfg?.filingStatus ?? "single";
  const exempt = taxCfg?.exempt ?? false;

  // ── Income tax: federal (progressive), then state and local ────────
  if (!exempt) {
    const levels: {
      level: "federal" | "state" | "local";
      code: string | null;
      allowances: number;
      additional: number;
    }[] = [
      { level: "federal", code: null, allowances: taxCfg?.federalAllowances ?? 0, additional: taxCfg?.additionalWithholding ?? 0 },
      { level: "state", code: taxCfg?.stateCode ?? null, allowances: taxCfg?.stateAllowances ?? 0, additional: taxCfg?.additionalStateWithholding ?? 0 },
      { level: "local", code: taxCfg?.localCode ?? null, allowances: 0, additional: 0 },
    ];

    for (const l of levels) {
      const brackets = await loadBrackets(organizationId, l.level, l.code, filingStatus, year, exec);
      let amount = 0;
      if (brackets.length > 0) {
        const allowanceCfg = await loadAllowanceConfig(organizationId, l.level, l.code, year, exec);
        amount = computePeriodWithholding({
          annualTaxableWage: taxableIncome * periods,
          brackets,
          filingStatus,
          payPeriodsPerYear: periods,
          allowances: l.allowances,
          allowanceValueCents: allowanceCfg.allowanceValueCents,
          standardDeductionCents: allowanceCfg.standardDeductionCents,
          additionalWithholding: l.additional,
        }).periodWithholding;
      } else if (l.level === "federal") {
        // No bracket schedule loaded yet → keep the legacy flat-rate behavior so
        // we never silently withhold zero income tax for un-migrated orgs.
        amount = Math.round((taxableIncome * emp.taxRate) / 10000) + Math.max(0, l.additional);
      } else if (l.additional > 0) {
        amount = l.additional;
      }

      if (amount > 0) {
        breakdown.push({
          jurisdictionLevel: l.level,
          jurisdiction: l.level === "federal" ? null : l.code?.trim().toUpperCase() || null,
          taxKind: "income_tax",
          amount,
        });
      }
    }
  }

  // ── Employee FICA ─────────────────────────────────────────────────
  // Applies to exempt employees too: W-4 exemption only covers income tax.
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
    employerBreakdown.push({ jurisdictionLevel: "state", jurisdiction: taxCfg?.stateCode?.trim().toUpperCase() || null, taxKind: "suta", amount: employer.suta });

  const totalTax = breakdown.reduce((s, b) => s + b.amount, 0);

  return { totalTax, breakdown, employerBreakdown };
}

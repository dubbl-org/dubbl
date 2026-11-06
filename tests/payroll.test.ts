import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHourlyPay, leaveHoursInPeriod, standardPeriodHours } from "../lib/payroll/overtime";
import { capLines, computeDeductionLines, type AssignedDeduction } from "../lib/payroll/calculations";
import { computeAccruedHours, computeCarryOver, computeLeaveBalance } from "../lib/payroll/leave-accrual";
import { selectBracketRows } from "../lib/api/payroll-withholding";
import { sumRunTotals } from "../lib/api/payroll-run-builder";
import {
  classifyDeduction,
  classifyTaxKind,
  splitUnitemizedWithholding,
} from "../lib/api/payroll-posting";

// ─── Hourly pay and overtime ────────────────────────────────────────

const RATE = 2500; // $25.00 an hour

function days(start: string, count: number, hours: number, shiftType = "regular") {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    out.push({ date: d.toISOString().slice(0, 10), hours, shiftType });
  }
  return out;
}

test("overtime is counted per week, not against the whole pay period", () => {
  // Two weeks of 45 hours in a biweekly period: 10 overtime hours, not 10 over 80
  // (the old per-period rule) and not 0.
  const entries = [...days("2026-03-02", 5, 9), ...days("2026-03-09", 5, 9)];
  const pay = computeHourlyPay({
    hourlyRate: RATE,
    entries,
    periodStart: "2026-03-02",
    periodEnd: "2026-03-15",
    weeklyThresholdHours: 40,
    overtimeMultiplier: 1.5,
  });
  assert.equal(pay.totalHours, 90);
  assert.equal(pay.regularHours, 80);
  assert.equal(pay.overtimeHours, 10);
  assert.equal(pay.regularAmount, 80 * RATE);
  assert.equal(pay.overtimeAmount, Math.round(10 * RATE * 1.5));
  assert.equal(pay.grossAmount, pay.regularAmount + pay.overtimeAmount);
});

test("a short week and a long week don't cancel out", () => {
  // 30 h then 50 h: 80 h in total but the second week has 10 h overtime.
  const entries = [...days("2026-03-02", 5, 6), ...days("2026-03-09", 5, 10)];
  const pay = computeHourlyPay({
    hourlyRate: RATE,
    entries,
    periodStart: "2026-03-02",
    periodEnd: "2026-03-15",
    weeklyThresholdHours: 40,
    overtimeMultiplier: 1.5,
  });
  assert.equal(pay.overtimeHours, 10);
  assert.equal(pay.regularHours, 70);
});

test("only hours inside the pay period count, and overtime shifts are always overtime", () => {
  const pay = computeHourlyPay({
    hourlyRate: RATE,
    entries: [
      { date: "2026-02-28", hours: 8 }, // before the period
      { date: "2026-03-02", hours: 8 },
      { date: "2026-03-03", hours: 2, shiftType: "overtime" },
    ],
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
    weeklyThresholdHours: 40,
    overtimeMultiplier: 2,
  });
  assert.equal(pay.totalHours, 10);
  assert.equal(pay.regularHours, 8);
  assert.equal(pay.overtimeHours, 2);
  assert.equal(pay.overtimeAmount, 2 * RATE * 2);
});

test("shift premiums are paid on top of the base rate", () => {
  const pay = computeHourlyPay({
    hourlyRate: 2000,
    entries: [{ date: "2026-03-02", hours: 8, shiftType: "night" }],
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
    weeklyThresholdHours: 40,
    overtimeMultiplier: 1.5,
    shiftPremiums: { night: 15 },
  });
  assert.equal(pay.regularAmount, 16000);
  assert.equal(pay.premiumAmount, 2400);
  assert.equal(pay.grossAmount, 18400);
});

test("a threshold of 0 turns weekly overtime off", () => {
  const pay = computeHourlyPay({
    hourlyRate: RATE,
    entries: days("2026-03-02", 6, 10),
    periodStart: "2026-03-02",
    periodEnd: "2026-03-08",
    weeklyThresholdHours: 0,
    overtimeMultiplier: 1.5,
  });
  assert.equal(pay.overtimeHours, 0);
  assert.equal(pay.regularHours, 60);
});

test("standard hours per pay period are 40 a week", () => {
  assert.equal(standardPeriodHours("weekly"), 40);
  assert.equal(standardPeriodHours("biweekly"), 80);
  assert.equal(standardPeriodHours("monthly"), 173.33);
});

test("leave spanning two pay periods is split by days", () => {
  const req = [{ startDate: "2026-03-30", endDate: "2026-04-02", hours: 32 }];
  assert.equal(leaveHoursInPeriod(req, "2026-03-01", "2026-03-31"), 16);
  assert.equal(leaveHoursInPeriod(req, "2026-04-01", "2026-04-30"), 16);
  assert.equal(leaveHoursInPeriod(req, "2026-05-01", "2026-05-31"), 0);
});

// ─── Deductions ─────────────────────────────────────────────────────

function ded(overrides: Partial<AssignedDeduction>): AssignedDeduction {
  return {
    deductionTypeId: "t",
    name: "401(k)",
    category: "pre_tax",
    amount: null,
    percent: null,
    defaultAmount: null,
    defaultPercent: null,
    ...overrides,
  };
}

test("employee amount or percent wins over the type default", () => {
  const lines = computeDeductionLines(
    100000,
    [
      ded({ deductionTypeId: "a", percent: 5, defaultPercent: 3 }),
      ded({ deductionTypeId: "b", name: "Union dues", category: "post_tax", defaultAmount: 2500 }),
      ded({ deductionTypeId: "c", amount: 1000, defaultAmount: 9999 }),
    ],
    "2026-03-01",
    "2026-03-31"
  );
  assert.deepEqual(
    lines.map((l) => [l.deductionTypeId, l.amount]),
    [["a", 5000], ["c", 1000], ["b", 2500]]
  );
});

test("deductions outside their start and end dates are skipped", () => {
  const lines = computeDeductionLines(
    100000,
    [
      ded({ deductionTypeId: "ended", amount: 100, endDate: "2026-02-28" }),
      ded({ deductionTypeId: "future", amount: 100, startDate: "2026-04-01" }),
      ded({ deductionTypeId: "on", amount: 100, startDate: "2026-03-15" }),
    ],
    "2026-03-01",
    "2026-03-31"
  );
  assert.deepEqual(lines.map((l) => l.deductionTypeId), ["on"]);
});

test("pre-tax deductions can't exceed gross", () => {
  const lines = computeDeductionLines(5000, [ded({ amount: 4000 }), ded({ deductionTypeId: "x", amount: 4000 })], "2026-03-01", "2026-03-31");
  assert.equal(lines.reduce((s, l) => s + l.amount, 0), 5000);
});

test("capLines trims in order and drops zero lines", () => {
  assert.deepEqual(capLines([{ amount: 300 }, { amount: 300 }, { amount: 300 }], 500), [{ amount: 300 }, { amount: 200 }]);
  assert.deepEqual(capLines([{ amount: 300 }], -5), []);
});

test("run totals convert each item at its own rate", () => {
  const totals = sumRunTotals([
    { grossAmount: 100000, deductions: 25000, netAmount: 75000, fxRate: 1 },
    { grossAmount: 100000, deductions: 20000, netAmount: 80000, fxRate: 1.1 },
  ]);
  assert.deepEqual(totals, { totalGross: 210000, totalDeductions: 47000, totalNet: 163000 });
});

// ─── Posting ────────────────────────────────────────────────────────

test("deduction names are classified to the right liability account", () => {
  assert.equal(classifyDeduction("Health benefit", "pre_tax"), "2245"); // used to match "fit"
  assert.equal(classifyDeduction("401(k)", "pre_tax"), "2245");
  assert.equal(classifyDeduction("Garnishment", "post_tax"), "2236");
  assert.equal(classifyDeduction("FIT extra", "post_tax"), "2220");
  assert.equal(classifyTaxKind("social_security"), "2235");
  assert.equal(classifyTaxKind("income_tax"), "2220");
});

test("un-itemized withholding is still credited, so the bank gets only take-home", () => {
  // Older item: $200 held back ($150 tax, $50 pre-tax), nothing itemized.
  assert.deepEqual(
    splitUnitemizedWithholding({ deductions: 20000, taxAmount: 15000, preTaxDeductions: 5000, itemized: 0, hasTaxRows: false }),
    { incomeTax: 15000, pensionBenefits: 5000, other: 0 }
  );
  // Tax rows exist and cover the tax; the rest goes to deductions.
  assert.deepEqual(
    splitUnitemizedWithholding({ deductions: 20000, taxAmount: 15000, preTaxDeductions: 0, itemized: 15000, hasTaxRows: true }),
    { incomeTax: 0, pensionBenefits: 0, other: 5000 }
  );
  // Fully itemized: nothing extra.
  assert.deepEqual(
    splitUnitemizedWithholding({ deductions: 20000, taxAmount: 15000, preTaxDeductions: 5000, itemized: 20000, hasTaxRows: true }),
    { incomeTax: 0, pensionBenefits: 0, other: 0 }
  );
  // Legacy row that only carries tax (deductions 0).
  assert.deepEqual(
    splitUnitemizedWithholding({ deductions: 0, taxAmount: 2200, preTaxDeductions: 0, itemized: 0, hasTaxRows: false }),
    { incomeTax: 2200, pensionBenefits: 0, other: 0 }
  );
});

// ─── Tax brackets by jurisdiction ───────────────────────────────────

type Row = { id: string; jurisdiction: string | null; filingStatus: string | null; taxYear: number | null };

test("state brackets for the employee's state win over org-wide ones", () => {
  const rows: Row[] = [
    { id: "ca", jurisdiction: "CA", filingStatus: null, taxYear: null },
    { id: "ny", jurisdiction: "NY", filingStatus: null, taxYear: null },
    { id: "any", jurisdiction: null, filingStatus: null, taxYear: null },
  ];
  assert.deepEqual(selectBracketRows(rows, "ca", "single", 2026).map((r) => r.id), ["ca"]);
  assert.deepEqual(selectBracketRows(rows, "TX", "single", 2026).map((r) => r.id), ["any"]);
  assert.deepEqual(selectBracketRows(rows, null, "single", 2026).map((r) => r.id), ["any"]);
});

test("an employee with no state uses the only state schedule there is", () => {
  const rows: Row[] = [{ id: "ca", jurisdiction: "CA", filingStatus: null, taxYear: null }];
  assert.deepEqual(selectBracketRows(rows, null, "single", 2026).map((r) => r.id), ["ca"]);
  const two: Row[] = [...rows, { id: "ny", jurisdiction: "NY", filingStatus: null, taxYear: null }];
  assert.deepEqual(selectBracketRows(two, null, "single", 2026), []);
});

test("filing status and tax year narrow the schedule", () => {
  const rows: Row[] = [
    { id: "single-2026", jurisdiction: null, filingStatus: "single", taxYear: 2026 },
    { id: "single-any", jurisdiction: null, filingStatus: "single", taxYear: null },
    { id: "joint-2026", jurisdiction: null, filingStatus: "married_joint", taxYear: 2026 },
  ];
  assert.deepEqual(selectBracketRows(rows, null, "single", 2026).map((r) => r.id), ["single-2026"]);
  assert.deepEqual(selectBracketRows(rows, null, "single", 2025).map((r) => r.id), ["single-any"]);
  assert.deepEqual(selectBracketRows(rows, null, "married_joint", 2026).map((r) => r.id), ["joint-2026"]);
});

// ─── Leave accrual ──────────────────────────────────────────────────

test("per-pay-period leave accrues for each finished pay run", () => {
  assert.equal(
    computeAccruedHours({ method: "per_pay_period", rate: 3.08, year: 2026, asOf: "2026-06-30", startDate: "2020-01-01", payRunsThisYear: 12 }),
    36.96
  );
});

test("monthly leave starts with the month the employee joined", () => {
  assert.equal(computeAccruedHours({ method: "monthly", rate: 8, year: 2026, asOf: "2026-06-15", startDate: "2020-01-01" }), 48);
  assert.equal(computeAccruedHours({ method: "monthly", rate: 8, year: 2026, asOf: "2026-06-15", startDate: "2026-04-20" }), 24);
  assert.equal(computeAccruedHours({ method: "monthly", rate: 8, year: 2026, asOf: "2026-06-15", startDate: "2026-07-01" }), 0);
});

test("annual leave is earned day by day; front-loaded is all there on day one", () => {
  assert.equal(computeAccruedHours({ method: "annually", rate: 120, year: 2026, asOf: "2026-12-31", startDate: "2020-01-01" }), 120);
  const half = computeAccruedHours({ method: "annually", rate: 120, year: 2026, asOf: "2026-07-01", startDate: "2020-01-01" });
  assert.ok(half > 59 && half < 61, `expected about 60, got ${half}`);
  assert.equal(computeAccruedHours({ method: "front_loaded", rate: 80, year: 2026, asOf: "2026-01-02", startDate: "2020-01-01" }), 80);
});

test("balance is carry-over + accrued - used, capped at the maximum", () => {
  assert.equal(computeLeaveBalance({ accrued: 40, used: 16, carriedOver: 8 }), 32);
  assert.equal(computeLeaveBalance({ accrued: 200, used: 0, maxBalance: 120 }), 120);
  assert.equal(computeLeaveBalance({ accrued: 8, used: 16 }), -8);
  assert.equal(computeCarryOver(50, 40), 40);
  assert.equal(computeCarryOver(-5, 40), 0);
  assert.equal(computeCarryOver(12.5, null), 12.5);
});

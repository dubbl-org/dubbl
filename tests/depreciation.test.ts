import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateMonthlyDepreciation,
  nextDepreciationCharge,
  monthBounds,
  type DepreciableAsset,
} from "../lib/fixed-assets/depreciation";

const base: DepreciableAsset = {
  purchasePrice: 12000_00,
  residualValue: 0,
  usefulLifeMonths: 12,
  depreciationMethod: "straight_line",
  accumulatedDepreciation: 0,
  purchaseDate: "2026-01-01",
  convention: "full_month",
  inServiceDate: "2026-01-01",
  totalExpectedUnits: null,
  depreciationRateBp: null,
};

/** Book every month until nothing is due, like the monthly job would. */
function schedule(asset: DepreciableAsset, max = 1000): number[] {
  const charges: number[] = [];
  let accumulated = asset.accumulatedDepreciation;
  for (let i = 0; i < max; i++) {
    const c = nextDepreciationCharge({ ...asset, accumulatedDepreciation: accumulated }, i, "2026-01-31");
    if (c <= 0) break;
    charges.push(c);
    accumulated += c;
  }
  return charges;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

test("straight line: equal months, lands exactly on the depreciable base", () => {
  const c = schedule(base);
  assert.equal(c.length, 12);
  assert.ok(c.every((x) => x === 1000_00));
  assert.equal(sum(c), 12000_00);
});

test("straight line: rounding residue goes into the final month", () => {
  const c = schedule({ ...base, purchasePrice: 10000, usefulLifeMonths: 3 });
  assert.deepEqual(c, [3333, 3333, 3334]);
});

test("straight line: never goes below the residual value", () => {
  const c = schedule({ ...base, residualValue: 2000_00, usefulLifeMonths: 10 });
  assert.equal(c.length, 10);
  assert.ok(c.every((x) => x === 1000_00));
});

test("declining balance: double declining when no rate is set", () => {
  const asset = { ...base, depreciationMethod: "declining_balance", usefulLifeMonths: 60 };
  const c = schedule(asset);
  // 2 / 5 years = 40% a year = 400 a month on 12,000.
  assert.equal(c[0], 400_00);
  assert.equal(c[1], Math.round((12000_00 - 400_00) * (0.4 / 12)));
  assert.ok(c[1] < c[0]);
  assert.equal(c.length, 60);
  assert.equal(sum(c), 12000_00);
});

test("declining balance: uses the asset's yearly rate when set", () => {
  const asset = { ...base, depreciationMethod: "declining_balance", usefulLifeMonths: 60, depreciationRateBp: 2000 };
  const c = schedule(asset);
  assert.equal(c[0], 200_00); // 20% a year of 12,000 = 200 a month
  assert.equal(sum(c), 12000_00);
});

test("sum of years' digits: front-loaded weights n, n-1, ... 1", () => {
  const c = schedule({ ...base, purchasePrice: 6000, usefulLifeMonths: 3, depreciationMethod: "sum_of_years_digits" });
  assert.deepEqual(c, [3000, 2000, 1000]);
});

test("sum of years' digits: each month smaller, total exact", () => {
  const c = schedule({ ...base, depreciationMethod: "sum_of_years_digits" });
  assert.equal(c.length, 12);
  for (let i = 1; i < c.length; i++) assert.ok(c[i] <= c[i - 1]);
  assert.equal(sum(c), 12000_00);
});

test("units of production: charge follows usage, capped at what's left", () => {
  const asset = { ...base, depreciationMethod: "units_of_production", totalExpectedUnits: 1000 };
  assert.equal(nextDepreciationCharge(asset, 0, "2026-01-31", 100), 1200_00);
  assert.equal(nextDepreciationCharge(asset, 0, "2026-01-31", 0), 0);
  assert.equal(nextDepreciationCharge(asset, 0, "2026-01-31"), 0);
  assert.equal(
    nextDepreciationCharge({ ...asset, accumulatedDepreciation: 11500_00 }, 9, "2026-01-31", 200),
    500_00
  );
});

test("units of production: conventions don't apply", () => {
  const asset = { ...base, depreciationMethod: "units_of_production", totalExpectedUnits: 1000, convention: "mid_month" };
  assert.equal(nextDepreciationCharge(asset, 0, "2026-01-31", 100), 1200_00);
});

for (const convention of ["mid_month", "half_year", "mid_quarter"]) {
  test(`${convention}: half the first month, the rest one month after the life ends`, () => {
    const c = schedule({ ...base, convention });
    assert.equal(c.length, 13);
    assert.equal(c[0], 500_00);
    assert.ok(c.slice(1, 12).every((x) => x === 1000_00));
    assert.equal(c[12], 500_00);
    assert.equal(sum(c), 12000_00);
  });
}

test("pro_rata_days: first month prorated by days in service", () => {
  // April has 30 days; in service from the 16th = 15 days.
  const c = schedule({ ...base, convention: "pro_rata_days", inServiceDate: "2026-04-16" });
  assert.equal(c[0], 500_00);
  assert.equal(c.length, 13);
  assert.equal(sum(c), 12000_00);
});

test("pro_rata_days: in service on the 1st is a full first month", () => {
  const c = schedule({ ...base, convention: "pro_rata_days", inServiceDate: "2026-04-01" });
  assert.equal(c.length, 12);
  assert.ok(c.every((x) => x === 1000_00));
});

test("full_at_purchase: everything in the first month", () => {
  const c = schedule({ ...base, convention: "full_at_purchase", residualValue: 1000_00 });
  assert.deepEqual(c, [11000_00]);
});

test("full_month: no first-month adjustment", () => {
  const c = schedule({ ...base, convention: "full_month" });
  assert.equal(c[0], 1000_00);
  assert.equal(c.length, 12);
});

test("every method and convention lands exactly on the depreciable base", () => {
  const methods = ["straight_line", "declining_balance", "sum_of_years_digits"];
  const conventions = ["full_month", "mid_month", "half_year", "mid_quarter", "pro_rata_days", "full_at_purchase"];
  for (const depreciationMethod of methods) {
    for (const convention of conventions) {
      const asset = { ...base, depreciationMethod, convention, inServiceDate: "2026-03-10", residualValue: 500_00, usefulLifeMonths: 36 };
      const c = schedule(asset);
      assert.equal(sum(c), 11500_00, `${depreciationMethod} / ${convention}`);
      assert.ok(c.every((x) => x > 0 && Number.isInteger(x)), `${depreciationMethod} / ${convention}`);
    }
  }
});

test("nothing due once fully depreciated", () => {
  assert.equal(nextDepreciationCharge({ ...base, accumulatedDepreciation: 12000_00 }, 5, "2026-06-30"), 0);
  assert.equal(nextDepreciationCharge({ ...base, purchasePrice: 0 }, 0, "2026-06-30"), 0);
});

test("nextDepreciationCharge matches calculateMonthlyDepreciation", () => {
  const asset = { ...base, depreciationMethod: "declining_balance", convention: "mid_month", depreciationRateBp: 2500 };
  assert.equal(
    nextDepreciationCharge(asset, 3, "2026-04-30"),
    calculateMonthlyDepreciation({ ...asset, periodIndex: 3, periodDate: "2026-04-30" })
  );
});

test("monthBounds handles leap years and month ends", () => {
  assert.deepEqual(monthBounds("2024-02-10"), { start: "2024-02-01", end: "2024-02-29" });
  assert.deepEqual(monthBounds("2026-12-31"), { start: "2026-12-01", end: "2026-12-31" });
});

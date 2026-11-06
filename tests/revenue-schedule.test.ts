import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonthsClamped,
  monthsInclusive,
  buildRevenuePeriods,
  autoRecognizes,
  deferralAmount,
  recognitionDate,
} from "../lib/api/revenue-schedule-math";

test("addMonthsClamped clamps to the end of shorter months", () => {
  assert.equal(addMonthsClamped("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsClamped("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonthsClamped("2026-03-15", 0), "2026-03-15");
  assert.equal(addMonthsClamped("2026-11-30", 3), "2027-02-28");
  assert.equal(addMonthsClamped("2026-12-01", 1), "2027-01-01");
});

test("monthsInclusive counts calendar months, minimum 1", () => {
  assert.equal(monthsInclusive("2026-01-01", "2026-12-31"), 12);
  assert.equal(monthsInclusive("2026-01-15", "2026-01-20"), 1);
  assert.equal(monthsInclusive("2026-11-01", "2027-02-01"), 4);
});

test("straight_line splits evenly with the remainder on the last period", () => {
  const periods = buildRevenuePeriods(100000, "2026-01-01", "2026-03-31", "straight_line");
  assert.deepEqual(
    periods.map((p) => p.amount),
    [33333, 33333, 33334]
  );
  assert.equal(periods.reduce((s, p) => s + p.amount, 0), 100000);
  assert.deepEqual(
    periods.map((p) => p.periodDate),
    ["2026-01-01", "2026-02-01", "2026-03-01"]
  );
});

test("milestone uses the monthly split but is never counted by the job", () => {
  const periods = buildRevenuePeriods(120000, "2026-01-31", "2026-04-30", "milestone");
  assert.equal(periods.length, 4);
  assert.equal(periods[1].periodDate, "2026-02-28");
  assert.equal(autoRecognizes("milestone"), false);
  assert.equal(autoRecognizes("straight_line"), true);
  assert.equal(autoRecognizes("on_completion"), true);
});

test("on_completion is a single period for the full amount on the end date", () => {
  assert.deepEqual(buildRevenuePeriods(50000, "2026-01-01", "2026-06-30", "on_completion"), [
    { periodDate: "2026-06-30", amount: 50000, sortOrder: 0 },
  ]);
});

test("deferralAmount leaves counted-without-entry periods in income", () => {
  // New schedule: defer everything.
  assert.equal(
    deferralAmount(90000, [
      { amount: 30000, recognized: false, journalEntryId: null },
      { amount: 30000, recognized: false, journalEntryId: null },
      { amount: 30000, recognized: false, journalEntryId: null },
    ]),
    90000
  );
  // Older schedule: one period posted for real, one only flagged.
  assert.equal(
    deferralAmount(90000, [
      { amount: 30000, recognized: true, journalEntryId: "je-1" },
      { amount: 30000, recognized: true, journalEntryId: null },
      { amount: 30000, recognized: false, journalEntryId: null },
    ]),
    60000
  );
});

test("recognitionDate never precedes the invoice nor lands in the future", () => {
  assert.equal(recognitionDate("2026-03-01", "2026-01-10", "2026-10-13"), "2026-03-01");
  assert.equal(recognitionDate("2026-01-01", "2026-01-10", "2026-10-13"), "2026-01-10");
  assert.equal(recognitionDate("2026-12-01", "2026-01-10", "2026-10-13"), "2026-10-13");
});

test("deferred revenue is the income-in-advance account, not accrued expenses", async () => {
  const { GENERIC_ACCOUNTS } = await import("../lib/db/chart-templates/generic");
  const { CHART_TEMPLATES } = await import("../lib/db/chart-templates");
  const generic2400 = GENERIC_ACCOUNTS.find((a) => a.code === "2400");
  assert.equal(generic2400?.name, "Unearned Revenue");
  assert.equal(generic2400?.type, "liability");
  assert.equal(GENERIC_ACCOUNTS.find((a) => a.code === "2300")?.name, "Accrued Expenses");
  // Every role-mapped chart that names the 2400 role maps it to a liability
  // that isn't an accruals account.
  for (const chart of Object.values(CHART_TEMPLATES)) {
    for (const a of chart.accounts) {
      if (!a.roles?.includes("2400")) continue;
      assert.equal(a.type, "liability", `${chart.id} ${a.code}`);
      assert.doesNotMatch(a.name, /accru/i, `${chart.id} ${a.code}`);
    }
  }
});

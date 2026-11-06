import { test } from "node:test";
import assert from "node:assert/strict";
import { fiscalYearStartFor } from "../lib/reports/fiscal-year-start";
import { calculateNextRunAt, nextRunAfterResume } from "../lib/reports/schedule-timing";

test("fiscal year start uses the start month when no financial year is set up", () => {
  assert.equal(fiscalYearStartFor("2026-10-14", 1), "2026-01-01");
  assert.equal(fiscalYearStartFor("2026-10-14", 7), "2026-07-01");
  assert.equal(fiscalYearStartFor("2026-03-31", 4), "2025-04-01");
  assert.equal(fiscalYearStartFor("2026-04-01", 4), "2026-04-01");
  assert.equal(fiscalYearStartFor("2026-10-14", null), "2026-01-01");
  assert.equal(fiscalYearStartFor("2026-10-14", 13), "2026-01-01");
});

test("a financial year that contains the date wins over the start month", () => {
  const years = [
    { startDate: "2025-03-15", endDate: "2026-06-30" },
    { startDate: "2026-07-01", endDate: "2027-06-30" },
  ];
  assert.equal(fiscalYearStartFor("2026-02-10", 1, years), "2025-03-15");
  assert.equal(fiscalYearStartFor("2026-06-30", 1, years), "2025-03-15");
  assert.equal(fiscalYearStartFor("2026-07-01", 1, years), "2026-07-01");
  assert.equal(fiscalYearStartFor("2028-01-05", 7, years), "2027-07-01");
});

test("resuming keeps a send time that is still in the future", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const next = new Date("2026-10-20T09:00:00Z");
  assert.equal(nextRunAfterResume("weekly", next, now).toISOString(), next.toISOString());
});

test("resuming moves a passed send time to the next future occurrence", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  assert.equal(nextRunAfterResume("daily", new Date("2026-10-10T09:00:00Z"), now).toISOString(), "2026-10-15T09:00:00.000Z");
  assert.equal(nextRunAfterResume("daily", new Date("2026-10-14T13:00:00Z"), now).toISOString(), "2026-10-14T13:00:00.000Z");
  assert.equal(nextRunAfterResume("weekly", new Date("2026-09-01T09:00:00Z"), now).toISOString(), "2026-10-20T09:00:00.000Z");
  const monthly = nextRunAfterResume("monthly", new Date("2026-06-03T09:00:00Z"), now);
  assert.ok(monthly > now);
  assert.equal(monthly.toISOString().slice(0, 10), "2026-11-03");
  const quarterly = nextRunAfterResume("quarterly", new Date("2026-01-03T09:00:00Z"), now);
  assert.equal(quarterly.toISOString().slice(0, 10), "2027-01-03");
  // A send time exactly now has passed: it moves on.
  assert.ok(nextRunAfterResume("daily", now, now) > now);
});

test("resuming with no send time on record waits one period", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  assert.equal(nextRunAfterResume("weekly", null, now).toISOString(), calculateNextRunAt("weekly", now).toISOString());
});

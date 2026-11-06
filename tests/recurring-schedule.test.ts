import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceDate, resumeSchedule } from "../lib/api/recurring-schedule";

test("advanceDate steps by each frequency", () => {
  assert.equal(advanceDate("2026-01-15", "weekly"), "2026-01-22");
  assert.equal(advanceDate("2026-01-15", "fortnightly"), "2026-01-29");
  assert.equal(advanceDate("2026-01-15", "monthly"), "2026-02-15");
  assert.equal(advanceDate("2026-01-15", "quarterly"), "2026-04-15");
  assert.equal(advanceDate("2026-01-15", "semi_annual"), "2026-07-15");
  assert.equal(advanceDate("2026-01-15", "annual"), "2027-01-15");
});

test("resuming skips the dates missed while paused", () => {
  const r = resumeSchedule({ nextRunDate: "2026-01-15", frequency: "monthly", endDate: null }, "2026-04-20");
  assert.deepEqual(r, { nextRunDate: "2026-05-15", status: "active" });
});

test("resuming on a scheduled day keeps that day", () => {
  const r = resumeSchedule({ nextRunDate: "2026-01-15", frequency: "monthly", endDate: null }, "2026-04-15");
  assert.equal(r.nextRunDate, "2026-04-15");
});

test("resuming before the next date changes nothing", () => {
  const r = resumeSchedule({ nextRunDate: "2026-06-01", frequency: "weekly", endDate: null }, "2026-04-20");
  assert.deepEqual(r, { nextRunDate: "2026-06-01", status: "active" });
});

test("resuming after the end date finishes the schedule", () => {
  const r = resumeSchedule({ nextRunDate: "2026-01-15", frequency: "monthly", endDate: "2026-04-30" }, "2026-04-20");
  assert.equal(r.status, "completed");
});

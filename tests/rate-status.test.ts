import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRate, STALE_AFTER_DAYS } from "../lib/currency/rate-status";

test("a fresh api rate is not stale and reports its age", () => {
  const s = classifyRate(1_080_000, "api", "2026-06-14", "2026-06-15", false);
  assert.equal(s.origin, "api");
  assert.equal(s.ageDays, 1);
  assert.equal(s.stale, false);
  assert.equal(s.missing, false);
  assert.equal(s.rate, 1_080_000);
});

test("an api rate older than the threshold is flagged stale", () => {
  const s = classifyRate(1_080_000, "api", "2026-06-01", "2026-06-15", false);
  assert.equal(s.ageDays, 14);
  assert.ok((s.ageDays ?? 0) > STALE_AFTER_DAYS);
  assert.equal(s.stale, true);
});

test("a manual rate is never flagged stale even when old", () => {
  const s = classifyRate(1_080_000, "manual", "2026-01-01", "2026-06-15", false);
  assert.equal(s.origin, "manual");
  assert.ok((s.ageDays ?? 0) > STALE_AFTER_DAYS);
  assert.equal(s.stale, false);
});

test("inverse resolution is reflected in the origin", () => {
  const s = classifyRate(925_925, "api", "2026-06-14", "2026-06-15", true);
  assert.equal(s.origin, "api-inverse");
  const m = classifyRate(925_925, "manual", "2026-06-14", "2026-06-15", true);
  assert.equal(m.origin, "manual-inverse");
});

test("a rate dated exactly the threshold ago is still fresh", () => {
  const s = classifyRate(1_000_000, "api", "2026-06-08", "2026-06-15", false);
  assert.equal(s.ageDays, STALE_AFTER_DAYS);
  assert.equal(s.stale, false);
});

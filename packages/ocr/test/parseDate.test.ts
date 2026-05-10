import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate } from "../src/parsers/date";
import { L, resetLineY } from "./helpers";

test("parseDate: ISO yyyy-mm-dd", () => {
  resetLineY();
  const f = parseDate([L("Date: 2026-01-15")]);
  assert.equal(f.value, "2026-01-15");
  assert.ok(f.confidence > 0.5);
});

test("parseDate: US mm/dd/yyyy with locale en-US", () => {
  resetLineY();
  const f = parseDate([L("Date: 03/15/2026")], "en-US");
  assert.equal(f.value, "2026-03-15");
});

test("parseDate: EU dd.mm.yyyy with locale de-DE", () => {
  resetLineY();
  const f = parseDate([L("Datum: 15.03.2026")], "de-DE");
  assert.equal(f.value, "2026-03-15");
});

test("parseDate: disambiguates by day > 12", () => {
  resetLineY();
  // 25/03/2026 — must be DMY because day 25 > 12.
  const f = parseDate([L("25/03/2026")], "en-US");
  assert.equal(f.value, "2026-03-25");
});

test("parseDate: '15 Jan 2026' textual month", () => {
  resetLineY();
  const f = parseDate([L("Issued: 15 Jan 2026")]);
  assert.equal(f.value, "2026-01-15");
});

test("parseDate: 'Jan 15, 2026' textual month US-style", () => {
  resetLineY();
  const f = parseDate([L("Date: Jan 15, 2026")]);
  assert.equal(f.value, "2026-01-15");
});

test("parseDate: 2-digit year mapping", () => {
  resetLineY();
  const f = parseDate([L("15/01/26")], "en-GB");
  assert.equal(f.value, "2026-01-15");
});

test("parseDate: returns null when no date found", () => {
  resetLineY();
  const f = parseDate([L("This receipt has no date")]);
  assert.equal(f.value, null);
});

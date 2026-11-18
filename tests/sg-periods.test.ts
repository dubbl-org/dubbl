import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fiscalYearRange,
  formCsDueDate,
  generatePeriods,
  type PeriodOrg,
} from "@/lib/tax/periods";

/**
 * The Singapore filing calendar for one fiscal year: GST accounting periods from
 * the registration date and frequency, then one ECI and one Form C-S period with
 * their statutory deadlines. Pure — org settings in, tax_period rows out.
 *
 * Fiscal years are named by the year they end, so FY2026 with a December year
 * end is 2026-01-01…2026-12-31.
 */

function org(overrides: Partial<PeriodOrg> = {}): PeriodOrg {
  return {
    fiscalYearStartMonth: 1,
    gstRegisteredAt: "2026-07-01",
    gstDeregisteredAt: null,
    gstFilingFrequency: "quarterly",
    gstPeriodStartMonth: 7,
    ...overrides,
  };
}

const gst = (rows: ReturnType<typeof generatePeriods>) =>
  rows.filter((r) => r.returnKind === "gst_f5");

describe("fiscal year", () => {
  it("runs a December year end as the calendar year", () => {
    assert.deepEqual(fiscalYearRange(org(), 2026), {
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
  });

  it("runs a June year end from July of the previous calendar year", () => {
    assert.deepEqual(fiscalYearRange(org({ fiscalYearStartMonth: 7 }), 2026), {
      startDate: "2025-07-01",
      endDate: "2026-06-30",
    });
  });
});

describe("GST periods", () => {
  it("gives a quarterly org registered 1 July two periods to the year end", () => {
    const periods = gst(generatePeriods(org(), 2026));
    assert.deepEqual(
      periods.map((p) => [p.name, p.startDate, p.endDate, p.type, p.dueDate]),
      [
        ["GST Q3 2026", "2026-07-01", "2026-09-30", "quarterly", "2026-10-30"],
        ["GST Q4 2026", "2026-10-01", "2026-12-31", "quarterly", "2027-01-30"],
      ]
    );
    assert.equal(periods[0].authority, "IRAS");
  });

  it("gives a monthly org registered 1 July six periods", () => {
    const periods = gst(
      generatePeriods(org({ gstFilingFrequency: "monthly" }), 2026)
    );
    assert.equal(periods.length, 6);
    assert.deepEqual(
      periods.map((p) => [p.startDate, p.endDate]),
      [
        ["2026-07-01", "2026-07-31"],
        ["2026-08-01", "2026-08-31"],
        ["2026-09-01", "2026-09-30"],
        ["2026-10-01", "2026-10-31"],
        ["2026-11-01", "2026-11-30"],
        ["2026-12-01", "2026-12-31"],
      ]
    );
    assert.deepEqual(
      periods.map((p) => p.name),
      ["GST Jul 2026", "GST Aug 2026", "GST Sep 2026", "GST Oct 2026", "GST Nov 2026", "GST Dec 2026"]
    );
    assert.equal(periods[0].type, "monthly");
  });

  it("starts the first period at registration when it falls mid-quarter", () => {
    const periods = gst(
      generatePeriods(org({ gstRegisteredAt: "2026-08-15" }), 2026)
    );
    assert.deepEqual(
      periods.map((p) => [p.startDate, p.endDate]),
      [
        ["2026-08-15", "2026-09-30"],
        ["2026-10-01", "2026-12-31"],
      ]
    );
  });

  it("ends the final period at deregistration", () => {
    const periods = gst(
      generatePeriods(
        org({ gstRegisteredAt: "2026-01-01", gstPeriodStartMonth: 1, gstDeregisteredAt: "2026-09-15" }),
        2026
      )
    );
    assert.deepEqual(
      periods.map((p) => [p.startDate, p.endDate]),
      [
        ["2026-01-01", "2026-03-31"],
        ["2026-04-01", "2026-06-30"],
        ["2026-07-01", "2026-09-15"],
      ]
    );
  });

  it("covers a full year for a June year end with a July anchor", () => {
    const periods = gst(
      generatePeriods(org({ fiscalYearStartMonth: 7, gstRegisteredAt: "2025-07-01" }), 2026)
    );
    assert.deepEqual(
      periods.map((p) => [p.name, p.startDate, p.endDate]),
      [
        ["GST Q3 2025", "2025-07-01", "2025-09-30"],
        ["GST Q4 2025", "2025-10-01", "2025-12-31"],
        ["GST Q1 2026", "2026-01-01", "2026-03-31"],
        ["GST Q2 2026", "2026-04-01", "2026-06-30"],
      ]
    );
  });

  it("generates no GST periods without a registration date", () => {
    const periods = generatePeriods(org({ gstRegisteredAt: null }), 2026);
    assert.deepEqual(
      periods.map((p) => p.returnKind),
      ["eci", "form_c_s"]
    );
  });
});

describe("annual periods and deadlines", () => {
  it("adds one ECI and one Form C-S period covering the fiscal year", () => {
    const annual = generatePeriods(org(), 2026).filter(
      (p) => p.returnKind !== "gst_f5"
    );
    assert.deepEqual(annual, [
      {
        name: "ECI FY2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        type: "annual",
        returnKind: "eci",
        authority: "IRAS",
        dueDate: "2027-03-31",
      },
      {
        name: "Form C-S FY2026",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        type: "annual",
        returnKind: "form_c_s",
        authority: "IRAS",
        dueDate: "2027-11-30",
      },
    ]);
  });

  it("dates the ECI three months after the year end", () => {
    const eci = generatePeriods(org({ fiscalYearStartMonth: 7 }), 2026).find(
      (p) => p.returnKind === "eci"
    );
    // 90 days after 30 Jun 2026 is 28 Sep 2026 — two days inside IRAS's
    // "within three months", so the deadline never lands late.
    assert.equal(eci?.dueDate, "2026-09-28");
  });

  it("dates Form C-S on 30 November of the year after the year end", () => {
    assert.equal(formCsDueDate("2026-12-31"), "2027-11-30");
    assert.equal(formCsDueDate("2026-06-30"), "2027-11-30");
  });
});

describe("idempotency", () => {
  it("returns the same rows for the same input", () => {
    assert.deepEqual(generatePeriods(org(), 2026), generatePeriods(org(), 2026));
  });

  it("never returns a duplicate period key", () => {
    const keys = generatePeriods(org({ fiscalYearStartMonth: 7 }), 2026).map(
      (p) => `${p.returnKind}|${p.startDate}|${p.endDate}`
    );
    assert.equal(new Set(keys).size, keys.length);
  });
});

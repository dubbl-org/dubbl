import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CORPORATE_TAX_RATE_BP,
  LOW_VALUE_POOL_CAP_CENTS,
  capitalAllowances,
  partialExemption,
  startupExemption,
  type CapitalAssetInput,
  type StartupExemptionInput,
} from "@/lib/tax/sg-tax-computation";

/**
 * The Singapore exemption ladder and capital allowances, against literal
 * figures taken from IRAS's published examples. Pure arithmetic, no database.
 *
 * Cents throughout: S$10,000 = 1_000_000, S$200,000 = 20_000_000.
 */

const S = (dollars: number) => dollars * 100;

function startupInput(
  overrides: Partial<StartupExemptionInput> = {}
): StartupExemptionInput {
  return {
    chargeableIncomeBeforeExemption: 0,
    yearOfAssessmentIndex: 1,
    incorporatedInSingapore: true,
    taxResident: true,
    shareholderConditionMet: true,
    ...overrides,
  };
}

function asset(overrides: Partial<CapitalAssetInput> = {}): CapitalAssetInput {
  return {
    cost: S(10_000),
    category: "computer",
    acquiredInYear: true,
    isLowValue: false,
    ...overrides,
  };
}

describe("partial tax exemption", () => {
  it("exempts 75% of the first S$10,000", () => {
    const result = partialExemption(S(10_000));
    assert.equal(result.exemptAmount, S(7_500));
    assert.equal(result.chargeableIncome, S(2_500));
  });

  it("exempts 75% of the first S$10,000 and 50% of the next S$190,000", () => {
    // 10k at 75% = 7,500; 180k at 50% = 90,000
    const result = partialExemption(S(190_000));
    assert.equal(result.exemptAmount, S(97_500));
    assert.equal(result.chargeableIncome, S(92_500));
  });

  it("caps at S$102,500 of exemption from S$200,000 upwards", () => {
    const atCap = partialExemption(S(200_000));
    assert.equal(atCap.exemptAmount, S(102_500));
    assert.equal(atCap.chargeableIncome, S(97_500));

    const above = partialExemption(S(500_000));
    assert.equal(above.exemptAmount, S(102_500));
    assert.equal(above.chargeableIncome, S(397_500));
  });

  it("gives nothing on nil or negative chargeable income", () => {
    assert.deepEqual(partialExemption(0), { exemptAmount: 0, chargeableIncome: 0 });
    assert.deepEqual(partialExemption(-S(5_000)), {
      exemptAmount: 0,
      chargeableIncome: 0,
    });
  });

  it("rounds the exempt share down, never up", () => {
    // 75% of 3 cents is 2.25 cents; the taxpayer keeps the fraction of a cent.
    const result = partialExemption(3);
    assert.equal(result.exemptAmount, 2);
    assert.equal(result.chargeableIncome, 1);
  });
});

describe("start-up tax exemption", () => {
  it("exempts 75% of the first S$100,000 in the first year of assessment", () => {
    const result = startupExemption(
      startupInput({ chargeableIncomeBeforeExemption: S(100_000) })
    );
    assert.equal(result.qualifies, true);
    assert.equal(result.exemptAmount, S(75_000));
    assert.equal(result.chargeableIncome, S(25_000));
  });

  it("exempts 50% of the next S$100,000 and caps at S$125,000", () => {
    const atCap = startupExemption(
      startupInput({ chargeableIncomeBeforeExemption: S(200_000) })
    );
    assert.equal(atCap.exemptAmount, S(125_000));
    assert.equal(atCap.chargeableIncome, S(75_000));

    const above = startupExemption(
      startupInput({ chargeableIncomeBeforeExemption: S(500_000) })
    );
    assert.equal(above.exemptAmount, S(125_000));
    assert.equal(above.chargeableIncome, S(375_000));
  });

  it("stops after the third year of assessment", () => {
    const third = startupExemption(
      startupInput({ chargeableIncomeBeforeExemption: S(100_000), yearOfAssessmentIndex: 3 })
    );
    assert.equal(third.qualifies, true);
    assert.equal(third.exemptAmount, S(75_000));

    const fourth = startupExemption(
      startupInput({ chargeableIncomeBeforeExemption: S(100_000), yearOfAssessmentIndex: 4 })
    );
    assert.equal(fourth.qualifies, false);
    assert.equal(fourth.exemptAmount, 0);
    assert.equal(fourth.chargeableIncome, S(100_000));
    assert.match(fourth.reason, /first three years/);
  });

  it("reports each failed condition instead of deciding policy", () => {
    const result = startupExemption(
      startupInput({
        chargeableIncomeBeforeExemption: S(100_000),
        incorporatedInSingapore: false,
        taxResident: false,
        shareholderConditionMet: false,
      })
    );
    assert.equal(result.qualifies, false);
    assert.equal(result.exemptAmount, 0);
    assert.match(result.reason, /incorporated in Singapore/);
    assert.match(result.reason, /tax resident/);
    assert.match(result.reason, /shareholder condition/);
  });

  it("carries the corporate rate the chargeable income is taxed at", () => {
    assert.equal(CORPORATE_TAX_RATE_BP, 1700);
  });
});

describe("capital allowances", () => {
  it("writes off a low-value item in full in the year of acquisition", () => {
    const result = capitalAllowances([
      asset({ cost: S(5_000), category: "office_equipment", isLowValue: true }),
    ]);
    assert.equal(result.assets[0].allowanceThisYear, S(5_000));
    assert.equal(result.assets[0].writtenOff, true);
    assert.equal(result.assets[0].carriedForward, 0);
    assert.equal(result.totalAllowance, S(5_000));
  });

  it("caps the low-value pool at S$30,000 per year and defers the balance", () => {
    const seven = Array.from({ length: 7 }, () =>
      asset({ cost: S(5_000), category: "computer", isLowValue: true })
    );
    const result = capitalAllowances(seven);
    assert.equal(LOW_VALUE_POOL_CAP_CENTS, S(30_000));
    assert.equal(result.lowValuePoolUsed, S(30_000));
    assert.equal(result.totalAllowance, S(30_000));
    // Six written off, the seventh carried forward to a later year.
    assert.equal(result.assets.filter((a) => a.writtenOff).length, 6);
    assert.equal(result.lowValueDeferred, S(5_000));
    assert.equal(result.carriedForward, S(5_000));
    assert.match(result.assets[6].note ?? "", /claimable next year/);
  });

  it("writes off a S$5,000 item but not a S$5,000.01 one (flag verified)", () => {
    const result = capitalAllowances([
      asset({ cost: 500_000, category: "computer", isLowValue: true }),
      asset({ cost: 500_001, category: "computer", isLowValue: true }),
    ]);
    assert.equal(result.assets[0].writtenOff, true);
    assert.equal(result.assets[1].writtenOff, false);
    // The 3-year line applies instead: floor(500001 / 3) = 166667.
    assert.equal(result.assets[1].allowanceThisYear, 166_667);
    assert.match(result.assets[1].note ?? "", /above S\$5,000/);
  });

  it("writes off a computer over three years straight line, totalling its cost", () => {
    const schedule = [0, 1, 2].map((claimed) =>
      capitalAllowances([
        asset({
          cost: S(10_000),
          category: "computer",
          acquiredInYear: false,
          yearsAlreadyClaimed: claimed,
        }),
      ]).assets[0]
    );
    // floor(1,000,000 / 3) = 333,333; the final year takes the remainder.
    assert.deepEqual(
      schedule.map((a) => a.allowanceThisYear),
      [333_333, 333_333, 333_334]
    );
    assert.deepEqual(
      schedule.map((a) => a.carriedForward),
      [666_667, 333_334, 0]
    );
    assert.equal(
      schedule.reduce((s, a) => s + a.allowanceThisYear, 0),
      S(10_000)
    );
  });

  it("claims nothing in a fourth year", () => {
    const result = capitalAllowances([
      asset({ cost: S(3_000), category: "furniture", acquiredInYear: false, yearsAlreadyClaimed: 3 }),
    ]);
    assert.equal(result.assets[0].allowanceThisYear, 0);
    assert.equal(result.assets[0].carriedForward, 0);
  });

  it("allows nothing on land or a private car", () => {
    const result = capitalAllowances([
      asset({ cost: S(500_000), category: "land", acquiredInYear: true }),
      asset({ cost: S(120_000), category: "private_car", acquiredInYear: true, isLowValue: true }),
    ]);
    assert.equal(result.totalAllowance, 0);
    assert.equal(result.notAllowable, S(620_000));
    assert.deepEqual(
      result.assets.map((a) => a.carriedForward),
      [0, 0]
    );
    assert.match(result.assets[0].note ?? "", /land/);
    assert.match(result.assets[1].note ?? "", /private cars/);
  });

  it("totals the year across mixed categories and renovation", () => {
    const result = capitalAllowances([
      asset({ cost: S(3_000), category: "computer", isLowValue: true }),
      asset({ cost: S(9_000), category: "renovation" }),
      asset({ cost: S(30_000), category: "office_equipment" }),
      asset({ cost: S(20_000), category: "land" }),
    ]);
    // 3,000 + 3,000 (9,000 / 3) + 10,000 (30,000 / 3) + 0
    assert.equal(result.totalAllowance, S(16_000));
    assert.equal(result.carriedForward, S(26_000));
    assert.equal(result.notAllowable, S(20_000));
  });
});

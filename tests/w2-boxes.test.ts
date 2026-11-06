import { test } from "node:test";
import assert from "node:assert/strict";
import { buildW2Boxes, box12CodeFor, w2DisplayRows, type W2ItemInput } from "../lib/tax-forms/w2";

const SS_BASE = 16810000; // $168,100

function item(overrides: Partial<W2ItemInput> = {}): W2ItemInput {
  return {
    grossAmount: 500000,
    taxAmount: 0,
    preTaxDeductions: 0,
    deductions: [],
    taxes: [],
    ...overrides,
  };
}

test("box 12 codes are picked from the deduction type name", () => {
  assert.equal(box12CodeFor("401(k)"), "D");
  assert.equal(box12CodeFor("Roth 401k"), "AA");
  assert.equal(box12CodeFor("403b plan"), "E");
  assert.equal(box12CodeFor("457(b)"), "G");
  assert.equal(box12CodeFor("HSA"), "W");
  assert.equal(box12CodeFor("Health insurance"), "DD");
  assert.equal(box12CodeFor("Dental"), "DD");
  assert.equal(box12CodeFor("Union dues"), null);
});

test("box 1 subtracts all pre-tax deductions; boxes 3/5 keep 401(k) but not health", () => {
  const w2 = buildW2Boxes(
    [
      item({
        grossAmount: 1000000,
        deductions: [
          { name: "401(k)", category: "pre_tax", amount: 50000 },
          { name: "Health insurance", category: "pre_tax", amount: 20000 },
          { name: "Union dues", category: "post_tax", amount: 3000 },
        ],
        taxes: [
          { taxKind: "income_tax", jurisdictionLevel: "federal", jurisdiction: null, amount: 120000 },
          { taxKind: "social_security", jurisdictionLevel: "federal", jurisdiction: null, amount: 60760 },
          { taxKind: "medicare", jurisdictionLevel: "federal", jurisdiction: null, amount: 14210 },
        ],
      }),
    ],
    { ssWageBaseCents: SS_BASE }
  );
  assert.equal(w2.box1_wages, 930000);
  assert.equal(w2.box3_ss_wages, 980000);
  assert.equal(w2.box5_medicare_wages, 980000);
  assert.equal(w2.box2_federal_tax, 120000);
  assert.equal(w2.box4_ss_tax, 60760);
  assert.equal(w2.box6_medicare_tax, 14210);
  assert.deepEqual(
    w2.box12.map((l) => [l.code, l.amount]),
    [["D", 50000], ["DD", 20000]]
  );
  assert.equal(w2.box13_retirement_plan, true);
  assert.deepEqual(w2.box14, [{ label: "Union dues", amount: 3000 }]);
});

test("box 3 is capped at the Social Security wage base, box 5 is not", () => {
  const items = Array.from({ length: 12 }, () => item({ grossAmount: 2000000 }));
  const w2 = buildW2Boxes(items, { ssWageBaseCents: SS_BASE });
  assert.equal(w2.box1_wages, 24000000);
  assert.equal(w2.box3_ss_wages, SS_BASE);
  assert.equal(w2.box5_medicare_wages, 24000000);
});

test("additional Medicare goes to box 6", () => {
  const w2 = buildW2Boxes(
    [
      item({
        taxes: [
          { taxKind: "medicare", jurisdictionLevel: "federal", jurisdiction: null, amount: 7250 },
          { taxKind: "additional_medicare", jurisdictionLevel: "federal", jurisdiction: null, amount: 900 },
        ],
      }),
    ],
    { ssWageBaseCents: SS_BASE }
  );
  assert.equal(w2.box6_medicare_tax, 8150);
});

test("state and local withholding is reported per jurisdiction with its wages", () => {
  const w2 = buildW2Boxes(
    [
      item({
        grossAmount: 400000,
        taxes: [
          { taxKind: "income_tax", jurisdictionLevel: "federal", jurisdiction: null, amount: 40000 },
          { taxKind: "income_tax", jurisdictionLevel: "state", jurisdiction: "CA", amount: 12000 },
          { taxKind: "income_tax", jurisdictionLevel: "local", jurisdiction: "SF", amount: 1500 },
        ],
      }),
      item({
        grossAmount: 300000,
        taxes: [{ taxKind: "income_tax", jurisdictionLevel: "state", jurisdiction: "NY", amount: 9000 }],
      }),
    ],
    { ssWageBaseCents: SS_BASE }
  );
  assert.equal(w2.box2_federal_tax, 40000);
  assert.deepEqual(w2.states, [
    { state: "CA", wages: 400000, tax: 12000 },
    { state: "NY", wages: 300000, tax: 9000 },
  ]);
  assert.deepEqual(w2.localities, [{ locality: "SF", wages: 400000, tax: 1500 }]);
  assert.equal(w2.box17_state_income_tax, 21000);
  assert.equal(w2.box19_local_income_tax, 1500);
});

test("items without breakdown rows fall back to taxAmount in box 2", () => {
  const w2 = buildW2Boxes(
    [
      item({ grossAmount: 500000, taxAmount: 100000, preTaxDeductions: 25000 }),
      item({
        grossAmount: 500000,
        taxAmount: 999999, // ignored: this item has breakdown rows
        taxes: [{ taxKind: "income_tax", jurisdictionLevel: "federal", jurisdiction: null, amount: 60000 }],
      }),
    ],
    { ssWageBaseCents: SS_BASE }
  );
  assert.equal(w2.box2_federal_tax, 160000);
  assert.equal(w2.box1_wages, 975000);
  assert.equal(w2.box4_ss_tax, 0);
});

test("display rows cover every box, including older forms", () => {
  const w2 = buildW2Boxes(
    [
      item({
        deductions: [{ name: "401(k)", category: "pre_tax", amount: 10000 }],
        taxes: [{ taxKind: "income_tax", jurisdictionLevel: "state", jurisdiction: "CA", amount: 500 }],
      }),
    ],
    { ssWageBaseCents: SS_BASE }
  );
  const labels = w2DisplayRows(w2 as unknown as Record<string, unknown>).map((r) => r.label);
  assert.ok(labels.includes("Box 12 code D - Elective deferrals to a 401(k)"));
  assert.ok(labels.includes("Box 16 - State wages (CA)"));
  assert.ok(labels.includes("Box 17 - State income tax (CA)"));

  const legacy = w2DisplayRows({ box1_wages: 100, box12_retirement_deferrals: 50, box14_other: 7 });
  assert.ok(legacy.some((r) => r.label === "Box 12 - Retirement deferrals" && r.amount === 50));
  assert.ok(legacy.some((r) => r.label === "Box 14 - Other" && r.amount === 7));
});

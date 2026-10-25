import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeReturn, type ReturnContext, type ReturnInputs } from "@/lib/tax/engine";
import { GB_MODULE, AU_MODULE } from "@/lib/tax/modules/eu-vat";
import { SG_MODULE } from "@/lib/tax/modules/sg";
import type { TaxModule } from "@/lib/tax/types";

/**
 * Regression net for the module refactor: the UK boxes must keep producing
 * exactly the figures the old hand-written route produced, and the Singapore
 * boxes must match the worked example in docs/planning/singapore-tax-modules.md.
 *
 * These are pure — `computeReturn` takes the ledger figures as numbers, so no
 * database is involved.
 */

const period = { startDate: "2026-01-01", endDate: "2026-03-31" };

function inputs(overrides: Partial<ReturnInputs> = {}): ReturnInputs {
  return {
    controls: {},
    docLines: {},
    docTotals: {},
    ecSales: 0,
    ecAcquisitions: 0,
    revenue: 0,
    accountTypes: {},
    accountTags: {},
    reverseChargeLedger: 0,
    reverseChargeDocs: 0,
    manual: {},
    schedule: {},
    ...overrides,
  };
}

function ctx(module: TaxModule, extra: Partial<ReturnContext> = {}): ReturnContext {
  return {
    country: module.country,
    currency: module.country === "SG" ? "SGD" : "GBP",
    basis: "accrual",
    period,
    ...extra,
  };
}

function byBox(module: TaxModule, def: ReturnDefinitionLike, data: ReturnInputs, c = ctx(module)) {
  const result = computeReturn(module, def, data, c);
  return Object.fromEntries(result.boxes.map((b) => [b.box, b.amount]));
}

type ReturnDefinitionLike = TaxModule["returns"][number];

describe("GB VAT100 boxes", () => {
  const vat100 = GB_MODULE.returns[0];
  const data = inputs({
    controls: {
      "2200": { debits: 0, credits: 20000 },
      "1500": { debits: 5000, credits: 0 },
    },
    // Reverse-charge output VAT self-accounted onto 2200: 3333 cents.
    reverseChargeLedger: 3333,
    docTotals: { "invoice:net": 100000, "bill:net": 25000 },
    ecSales: 4000,
    ecAcquisitions: 1500,
  });

  it("matches the pre-refactor figures box for box", () => {
    assert.deepEqual(byBox(GB_MODULE, vat100, data), {
      "1": 16667, // 20000 output - 3333 reverse charge
      "2": 3333,
      "3": 20000,
      "4": 5000,
      "5": 15000,
      "6": 100000,
      "7": 25000,
      "8": 4000,
      "9": 1500,
    });
  });

  it("applies the flat-rate scheme to box 1 only, zeroing boxes 2 and 4", () => {
    const flat = {
      ...data,
      docTotals: { ...data.docTotals, "invoice:gross": 120000 },
    };
    const boxes = byBox(GB_MODULE, vat100, flat, ctx(GB_MODULE, { flatRatePercent: 1450 }));
    assert.equal(boxes["1"], 17400); // 14.5% of 120000
    assert.equal(boxes["2"], 0);
    assert.equal(boxes["4"], 0);
    assert.equal(boxes["3"], 17400);
    assert.equal(boxes["5"], 17400);
  });

  it("labels the boxes the way the filed return does", () => {
    const result = computeReturn(GB_MODULE, vat100, data, ctx(GB_MODULE));
    assert.equal(result.boxes[0].label, "VAT due on sales");
    assert.equal(result.boxes[8].label, "Total acquisitions from EU ex-VAT");
    assert.equal(result.authority, "HMRC");
  });
});

describe("AU BAS fields", () => {
  it("keeps G1/G11 gross and 1A/1B from the control accounts", () => {
    const bas = AU_MODULE.returns[0];
    const boxes = byBox(
      AU_MODULE,
      bas,
      inputs({
        controls: {
          "2200": { debits: 0, credits: 10000 },
          "1500": { debits: 3000, credits: 0 },
        },
        docTotals: { "invoice:gross": 110000, "bill:gross": 33000 },
        ecSales: 5000,
      })
    );
    assert.equal(boxes.G1, 110000);
    assert.equal(boxes.G2, 5000);
    assert.equal(boxes.G3, 0);
    assert.equal(boxes.G10, 0);
    assert.equal(boxes.G11, 33000);
    assert.equal(boxes["1A"], 10000);
    assert.equal(boxes["1B"], 3000);
    assert.equal(boxes.NET, 7000);
  });
});

describe("SG GST F5 boxes", () => {
  const f5 = SG_MODULE.returns[0];
  const data = inputs({
    docLines: {
      "invoiceLine:net": { standard: 100000, zero_rated: 20000, exempt: 5000 },
      "billLine:net": { standard: 30000 },
    },
    controls: {
      "2200": { debits: 0, credits: 9500 },
      "1500": { debits: 2700, credits: 0 },
    },
    // 500 of output tax is reverse charge, reported in box 14 instead of box 6.
    reverseChargeDocs: 500,
    revenue: 120000,
  });

  it("splits supplies by category and nets output against input tax", () => {
    const boxes = byBox(SG_MODULE, f5, data, ctx(SG_MODULE));
    assert.equal(boxes["1"], 100000); // standard-rated supplies
    assert.equal(boxes["2"], 20000); // zero-rated
    assert.equal(boxes["3"], 5000); // exempt
    assert.equal(boxes["4"], 125000); // total supplies
    assert.equal(boxes["5"], 30000); // taxable purchases
    assert.equal(boxes["6"], 9000); // output tax less reverse charge
    assert.equal(boxes["7"], 2700); // input tax
    assert.equal(boxes["8"], 6300); // net GST payable
    assert.equal(boxes["13"], 120000); // revenue
    assert.equal(boxes["14"], 500); // imported services / LVG
  });

  it("leaves the optional MES/refund boxes at zero", () => {
    const boxes = byBox(SG_MODULE, f5, data, ctx(SG_MODULE));
    for (const box of ["9", "10", "11", "12", "15", "16", "17"]) {
      assert.equal(boxes[box], 0, `box ${box} should be blank`);
    }
  });

  it("counts a negative net as a refund, not as zero", () => {
    const refund = inputs({
      controls: {
        "2200": { debits: 0, credits: 100 },
        "1500": { debits: 5000, credits: 0 },
      },
    });
    assert.equal(byBox(SG_MODULE, f5, refund, ctx(SG_MODULE))["8"], -4900);
  });

  it("files in SGD and only on the accrual basis", () => {
    const result = computeReturn(SG_MODULE, f5, data, ctx(SG_MODULE));
    assert.equal(result.currency, "SGD");
    assert.deepEqual(f5.bases, ["accrual"]);
  });
});

describe("manual overrides", () => {
  it("wins over a computed box and is marked as manual", () => {
    const f5 = SG_MODULE.returns[0];
    const result = computeReturn(
      SG_MODULE,
      f5,
      inputs({ docLines: { "invoiceLine:net": { standard: 100000 } }, manual: { "1": 55555 } }),
      ctx(SG_MODULE)
    );
    const box1 = result.boxes.find((b) => b.box === "1")!;
    assert.equal(box1.amount, 55555);
    assert.equal(box1.source, "manual");
  });

  it("feeds derived boxes (box 8 follows an overridden box 6)", () => {
    const f5 = SG_MODULE.returns[0];
    const boxes = byBox(
      SG_MODULE,
      f5,
      inputs({ manual: { "6": 1000, "7": 250 } }),
      ctx(SG_MODULE)
    );
    assert.equal(boxes["8"], 750);
  });
});

describe("reconciliation", () => {
  it("compares document supply totals with revenue", () => {
    const f5 = SG_MODULE.returns[0];
    const result = computeReturn(
      SG_MODULE,
      f5,
      inputs({
        docLines: { "invoiceLine:net": { standard: 100000 } },
        revenue: 120000,
      }),
      ctx(SG_MODULE)
    );
    const row = result.reconciliation[0];
    assert.equal(row.returnAmount, 100000);
    assert.equal(row.ledgerAmount, 120000);
    assert.equal(row.delta, -20000);
  });
});

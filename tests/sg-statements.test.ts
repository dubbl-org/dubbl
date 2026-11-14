import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFsModel } from "@/lib/reports/fs-model";
import type { AccountAggregate } from "@/lib/reports/gl-query";
import { SG_MODULE } from "@/lib/tax/modules/sg";

/**
 * SFRS presentation for a Singapore company, checked against literals.
 *
 * `buildFsModel` is pure: account aggregates in, statement sections out. The
 * figures below are a small set of balanced books in integer cents, so every
 * expected number is written out rather than recomputed from the model.
 */

const presentation = SG_MODULE.fsPresentation!;

function acct(
  code: string,
  name: string,
  type: AccountAggregate["type"],
  subType: string | null,
  balance: number
): AccountAggregate {
  const debitNormal = type === "asset" || type === "expense";
  const debit = debitNormal ? Math.max(balance, 0) : Math.max(-balance, 0);
  const credit = debitNormal ? Math.max(-balance, 0) : Math.max(balance, 0);
  return { accountId: `id-${code}`, code, name, type, subType, debit, credit, balance };
}

/**
 * Balanced books (in cents):
 *   assets 160,202.50 = liabilities 40,900.00 + equity 80,802.50
 *   + unclosed profit 38,500.00
 * Fed deliberately out of order so the caption order can only come from the
 * module.
 */
const books: AccountAggregate[] = [
  acct("1700", "Computer Equipment", "asset", "fixed", 12_000_000),
  acct("6110", "Salaries and Wages", "expense", "payroll", 1_500_000),
  acct("2200", "Output GST", "liability", "output_vat", 90_000),
  acct("1200", "Trade Receivables", "asset", "receivable", 2_000_000),
  acct("6200", "Rent", "expense", "operating", 500_000),
  acct("3200", "Retained Earnings", "equity", "retained", 3_080_250),
  acct("5000", "Purchases", "expense", "cogs", 2_000_000),
  acct("1780", "Accumulated Depreciation", "asset", "fixed", -3_000_000),
  acct("3000", "Share Capital", "equity", "equity", 5_000_000),
  acct("2100", "Trade Payables", "liability", "current", 3_000_000),
  acct("4300", "Other Income", "revenue", "non_operating", 100_000),
  acct("5500", "Depreciation Expense", "expense", "depreciation", 250_000),
  acct("1100", "Bank — DBS", "asset", "bank", 5_000_000),
  acct("2500", "Term Loan", "liability", "non_current", 1_000_000),
  acct("1500", "Input GST", "asset", "input_vat", 20_250),
  acct("4000", "Sales — Goods", "revenue", "revenue", 8_000_000),
];

describe("SFRS presentation", () => {
  it("splits current and non-current sections with their own subtotals", () => {
    const model = buildFsModel({ accounts: books, presentation });

    // Current assets: bank 50,000.00 + receivables 20,000.00 + input GST 202.50.
    assert.equal(model.assets.current.total, 7_020_250);
    assert.deepEqual(
      model.assets.current.rows.map((r) => [r.caption, r.amount]),
      [
        ["Cash and cash equivalents", 5_000_000],
        ["Trade and other receivables", 2_000_000],
        ["GST recoverable", 20_250],
      ]
    );

    // Non-current: 120,000.00 equipment less 30,000.00 accumulated depreciation.
    assert.equal(model.assets.nonCurrent.total, 9_000_000);
    assert.deepEqual(
      model.assets.nonCurrent.rows.map((r) => [r.caption, r.amount]),
      [["Property, plant and equipment", 9_000_000]]
    );
    assert.equal(model.assets.total, 16_020_250);

    // GST payable is due within the year, so it is current; the term loan is not.
    assert.equal(model.liabilities.current.total, 3_090_000);
    assert.deepEqual(
      model.liabilities.current.rows.map((r) => [r.caption, r.amount]),
      [
        ["Trade and other payables", 3_000_000],
        ["GST payable", 90_000],
      ]
    );
    assert.equal(model.liabilities.nonCurrent.total, 1_000_000);
    assert.equal(model.liabilities.total, 4_090_000);
  });

  it("orders captions by the module, income statement by nature of expense", () => {
    const model = buildFsModel({ accounts: books, presentation });

    assert.deepEqual(
      model.income.rows.map((r) => [r.caption, r.amount]),
      [
        ["Revenue", 8_000_000],
        ["Other income and expenses", 100_000],
      ]
    );
    assert.deepEqual(
      model.expenses.rows.map((r) => [r.caption, r.amount]),
      [
        ["Cost of sales", 2_000_000],
        ["Employee benefits expense", 1_500_000],
        ["Depreciation expense", 250_000],
        ["Other operating expenses", 500_000],
      ]
    );
    assert.equal(model.netProfit, 3_850_000);
  });

  it("reports no imbalance when the books balance and the gap when they do not", () => {
    const balanced = buildFsModel({ accounts: books, presentation });
    assert.equal(balanced.imbalance, 0);

    // Same postings with retained earnings 12.34 short (one side of an entry
    // missing): assets stay 160,202.50 while liabilities + equity fall.
    const short = books.map((a) =>
      a.code === "3200" ? acct("3200", a.name, a.type, a.subType, 3_079_016) : a
    );
    const unbalanced = buildFsModel({ accounts: short, presentation });
    assert.equal(unbalanced.imbalance, 1_234);
  });

  it("closes the statement of changes in equity at posted equity plus profit", () => {
    const model = buildFsModel({ accounts: books, presentation });

    assert.deepEqual(model.soce.rows.map((r) => r.caption), [
      "Balance at start of year",
      "Profit for the year",
      "Balance at end of year",
    ]);

    // Share capital 50,000.00 in its own column; retained earnings 30,802.50
    // brought forward plus 38,500.00 profit = 69,302.50.
    assert.deepEqual(model.soce.closing, {
      shareCapital: 5_000_000,
      retainedEarnings: 6_930_250,
      total: 11_930_250,
    });
    assert.equal(model.soce.rows[1].retainedEarnings, 3_850_000);
    // And it ties to the balance sheet: equity 80,802.50 + profit 38,500.00.
    assert.equal(model.equity.total, 8_080_250);
    assert.equal(model.soce.closing.total, model.equity.total + model.netProfit);
  });

  it("takes opening equity from the caller when a prior period is available", () => {
    const model = buildFsModel({
      accounts: books,
      presentation,
      openingEquity: { shareCapital: 4_000_000, retainedEarnings: 2_000_000 },
    });

    assert.deepEqual(model.soce.rows[0], {
      caption: "Balance at start of year",
      shareCapital: 4_000_000,
      retainedEarnings: 2_000_000,
      total: 6_000_000,
    });
    // Closing still comes from the ledger, not from the opening plus profit.
    assert.deepEqual(model.soce.closing, {
      shareCapital: 5_000_000,
      retainedEarnings: 6_930_250,
      total: 11_930_250,
    });
  });
});

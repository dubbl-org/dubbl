import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkMatchPreconditions } from "@/lib/api/match-expense-op";

const valid = {
  accountType: "loan",
  accountHasGl: true,
  claimStatus: "draft",
  claimCurrency: "EUR",
  claimTotal: 1323,
  txAmount: -1323,
  txCurrency: "EUR",
  itemCount: 1,
  itemAccountId: "acct-1",
};

describe("checkMatchPreconditions (founder-funding match)", () => {
  it("accepts a matching one-item draft claim on a founder account", () => {
    const result = checkMatchPreconditions(valid);
    assert.equal(result.accountId, "acct-1");
  });

  it("rejects non-loan accounts (no founder funding from company bank)", () => {
    for (const accountType of ["checking", "savings", "credit_card", "cash"]) {
      assert.throws(
        () => checkMatchPreconditions({ ...valid, accountType }),
        /founder current accounts/i
      );
    }
  });

  it("rejects loan accounts without a GL account", () => {
    assert.throws(
      () => checkMatchPreconditions({ ...valid, accountHasGl: false }),
      /founder current accounts/i
    );
  });

  it("rejects claims that are not draft", () => {
    for (const claimStatus of ["submitted", "approved", "paid", "founder_funded"]) {
      assert.throws(
        () => checkMatchPreconditions({ ...valid, claimStatus }),
        /draft|founder-funded/i
      );
    }
  });

  it("rejects currency mismatch", () => {
    assert.throws(
      () => checkMatchPreconditions({ ...valid, txCurrency: "SGD" }),
      /currency does not match/i
    );
  });

  it("accepts sign orientation (negative transaction vs positive claim)", () => {
    assert.doesNotThrow(() => checkMatchPreconditions(valid));
  });

  it("rejects amount mismatch even by one cent", () => {
    assert.throws(
      () => checkMatchPreconditions({ ...valid, claimTotal: 1324 }),
      /does not match/i
    );
    assert.throws(
      () => checkMatchPreconditions({ ...valid, txAmount: -132 }),
      /does not match/i
    );
  });

  it("rejects multi-item and uncategorized claims", () => {
    assert.throws(
      () => checkMatchPreconditions({ ...valid, itemCount: 2 }),
      /one-item/i
    );
    assert.throws(
      () => checkMatchPreconditions({ ...valid, itemAccountId: null }),
      /categorize/i
    );
  });
});

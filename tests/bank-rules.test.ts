import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRuleOutcome } from "../lib/banking/rule-outcome";
import {
  RECONCILIATION_ADJUSTMENT_ACCOUNTS,
  adjustmentAccountFor,
  buildReconciliationAdjustmentLines,
} from "../lib/banking/reconciliation-adjustment";
import { CHART_TEMPLATES, GENERIC_ACCOUNTS } from "../lib/db/chart-templates";
import { FR_ACCOUNTS } from "../lib/db/chart-templates/fr";
import { ES_ACCOUNTS } from "../lib/db/chart-templates/es";
import { DE_ACCOUNTS } from "../lib/db/chart-templates/de";
import { SE_ACCOUNTS } from "../lib/db/chart-templates/se";
import { BR_ACCOUNTS } from "../lib/db/chart-templates/br";
import { BE_ACCOUNTS } from "../lib/db/chart-templates/be";
import { AT_ACCOUNTS } from "../lib/db/chart-templates/at";
import { IT_ACCOUNTS } from "../lib/db/chart-templates/it";
import { PT_ACCOUNTS } from "../lib/db/chart-templates/pt";
import { UNIVERSAL_ACCOUNTS } from "../lib/db/chart-templates/universal";

const rule = (over: Partial<{ accountId: string | null; reconcile: boolean; splitAllocations: unknown[] | null }> = {}) => ({
  accountId: "acc-1",
  reconcile: false,
  splitAllocations: null,
  ...over,
});

test("a rule without auto-categorize only suggests the category", () => {
  assert.equal(decideRuleOutcome(rule(), true), "suggest");
});

test("an auto-categorize rule with an account posts", () => {
  assert.equal(decideRuleOutcome(rule({ reconcile: true }), true), "post");
});

test("an auto-categorize rule with no account can't post, so it only suggests", () => {
  assert.equal(decideRuleOutcome(rule({ reconcile: true, accountId: null }), true), "suggest");
});

test("split rules post their parts", () => {
  assert.equal(decideRuleOutcome(rule({ accountId: null, splitAllocations: [{ accountId: "a", percent: 50 }] }), true), "split");
  // An empty split list is not a split.
  assert.equal(decideRuleOutcome(rule({ splitAllocations: [] }), true), "suggest");
});

test("nothing is posted without a user to post as", () => {
  assert.equal(decideRuleOutcome(rule({ reconcile: true }), false), "suggest");
  assert.equal(decideRuleOutcome(rule({ splitAllocations: [{ accountId: "a" }] }), false), "suggest");
});

test("a positive difference debits the bank and credits adjustment income", () => {
  const lines = buildReconciliationAdjustmentLines({ amount: 350, bankGlAccountId: "bank", adjustmentAccountId: "adj" });
  assert.deepEqual(lines, [
    { accountId: "bank", debitAmount: 350, creditAmount: 0 },
    { accountId: "adj", debitAmount: 0, creditAmount: 350 },
  ]);
  assert.equal(adjustmentAccountFor(350), RECONCILIATION_ADJUSTMENT_ACCOUNTS.income);
});

test("a negative difference credits the bank and debits adjustment expense", () => {
  const lines = buildReconciliationAdjustmentLines({ amount: -1234, bankGlAccountId: "bank", adjustmentAccountId: "adj" });
  assert.deepEqual(lines, [
    { accountId: "bank", debitAmount: 0, creditAmount: 1234 },
    { accountId: "adj", debitAmount: 1234, creditAmount: 0 },
  ]);
  assert.equal(adjustmentAccountFor(-1234), RECONCILIATION_ADJUSTMENT_ACCOUNTS.expense);
});

test("write-off lines always balance", () => {
  for (const amount of [1, -1, 99, -4999, 3498100]) {
    const lines = buildReconciliationAdjustmentLines({ amount, bankGlAccountId: "b", adjustmentAccountId: "a" });
    const dr = lines.reduce((s, l) => s + l.debitAmount, 0);
    const cr = lines.reduce((s, l) => s + l.creditAmount, 0);
    assert.equal(dr, cr);
    assert.equal(dr, Math.abs(amount));
  }
});

test("a zero or fractional write-off is rejected", () => {
  assert.throws(() => buildReconciliationAdjustmentLines({ amount: 0, bankGlAccountId: "b", adjustmentAccountId: "a" }));
  assert.throws(() => buildReconciliationAdjustmentLines({ amount: 1.5, bankGlAccountId: "b", adjustmentAccountId: "a" }));
});

test("the adjustment account codes are used by no chart template", () => {
  const codes = [RECONCILIATION_ADJUSTMENT_ACCOUNTS.income.code, RECONCILIATION_ADJUSTMENT_ACCOUNTS.expense.code];
  const legacy = [GENERIC_ACCOUNTS, FR_ACCOUNTS, ES_ACCOUNTS, DE_ACCOUNTS, SE_ACCOUNTS, BR_ACCOUNTS, BE_ACCOUNTS, AT_ACCOUNTS, IT_ACCOUNTS, PT_ACCOUNTS, UNIVERSAL_ACCOUNTS];
  for (const list of legacy) {
    for (const a of list) assert.ok(!codes.includes(a.code), `${a.code} ${a.name} collides`);
  }
  for (const tpl of Object.values(CHART_TEMPLATES)) {
    for (const a of [...tpl.accounts, ...tpl.onDemand]) {
      assert.ok(!codes.includes(a.code), `${tpl.id}: ${a.code} ${a.name} collides`);
      for (const r of a.roles ?? []) assert.ok(!codes.includes(r), `${tpl.id}: role ${r} on ${a.name} collides`);
    }
  }
});

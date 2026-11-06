import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approvalSubject,
  evaluateCondition,
  selectApprovalWorkflow,
  workflowMatches,
} from "../lib/approvals/select";

const wf = (
  id: string,
  createdAt: string,
  conditions: { field: string; operator: string; value: string }[] = []
) => ({ id, createdAt: new Date(createdAt), conditions });

test("evaluateCondition compares money fields as numbers (cents)", () => {
  const bill = { total: 600000 };
  assert.equal(evaluateCondition({ field: "total", operator: "gt", value: "500000" }, bill), true);
  assert.equal(evaluateCondition({ field: "total", operator: "lt", value: "500000" }, bill), false);
  assert.equal(evaluateCondition({ field: "total", operator: "gte", value: "600000" }, bill), true);
  assert.equal(evaluateCondition({ field: "total", operator: "lte", value: "599999" }, bill), false);
  assert.equal(evaluateCondition({ field: "total", operator: "eq", value: "600000" }, bill), true);
  assert.equal(evaluateCondition({ field: "total", operator: "neq", value: "600000" }, bill), false);
});

test("evaluateCondition compares text fields exactly and rejects unknown operators", () => {
  assert.equal(evaluateCondition({ field: "currencyCode", operator: "eq", value: "EUR" }, { currencyCode: "EUR" }), true);
  assert.equal(evaluateCondition({ field: "currencyCode", operator: "neq", value: "EUR" }, { currencyCode: "USD" }), true);
  assert.equal(evaluateCondition({ field: "total", operator: "between", value: "1" }, { total: 1 }), false);
});

test("a workflow with no conditions matches everything", () => {
  assert.equal(workflowMatches([], { total: 1 }), true);
  assert.equal(workflowMatches(null, {}), true);
});

test("all conditions must match", () => {
  const conds = [
    { field: "total", operator: "gt", value: "100" },
    { field: "currencyCode", operator: "eq", value: "USD" },
  ];
  assert.equal(workflowMatches(conds, { total: 200, currencyCode: "USD" }), true);
  assert.equal(workflowMatches(conds, { total: 200, currencyCode: "EUR" }), false);
});

test("approvalSubject exposes an expense claim's totalAmount as total", () => {
  assert.equal(approvalSubject("expense", { totalAmount: 4200 }).total, 4200);
  assert.equal(approvalSubject("bill", { total: 10 }).total, 10);
});

test("selectApprovalWorkflow returns null when nothing matches", () => {
  const workflows = [wf("a", "2026-01-01", [{ field: "total", operator: "gt", value: "1000" }])];
  assert.equal(selectApprovalWorkflow(workflows, { total: 500 }), null);
  assert.equal(selectApprovalWorkflow([], { total: 500 }), null);
});

test("the most specific matching workflow wins, whatever the input order", () => {
  const catchAll = wf("catch-all", "2025-01-01");
  const big = wf("big", "2026-03-01", [{ field: "total", operator: "gt", value: "500000" }]);
  const bigUsd = wf("big-usd", "2026-06-01", [
    { field: "total", operator: "gt", value: "500000" },
    { field: "currencyCode", operator: "eq", value: "USD" },
  ]);
  const entity = { total: 750000, currencyCode: "USD" };
  for (const order of [
    [catchAll, big, bigUsd],
    [bigUsd, big, catchAll],
    [big, catchAll, bigUsd],
  ]) {
    assert.equal(selectApprovalWorkflow(order, entity)?.id, "big-usd");
  }
  // In another currency the two-condition workflow doesn't match, so the
  // one-condition workflow beats the catch-all.
  assert.equal(selectApprovalWorkflow([catchAll, bigUsd, big], { total: 750000, currencyCode: "EUR" })?.id, "big");
  // A small bill only matches the catch-all.
  assert.equal(selectApprovalWorkflow([bigUsd, big, catchAll], { total: 100, currencyCode: "USD" })?.id, "catch-all");
});

test("ties go to the oldest workflow, then the lowest id", () => {
  const newer = wf("b-newer", "2026-05-01", [{ field: "total", operator: "gt", value: "0" }]);
  const older = wf("z-older", "2026-01-01", [{ field: "total", operator: "gt", value: "10" }]);
  assert.equal(selectApprovalWorkflow([newer, older], { total: 50 })?.id, "z-older");
  assert.equal(selectApprovalWorkflow([older, newer], { total: 50 })?.id, "z-older");

  const sameTimeB = wf("bbb", "2026-01-01");
  const sameTimeA = wf("aaa", "2026-01-01");
  assert.equal(selectApprovalWorkflow([sameTimeB, sameTimeA], {})?.id, "aaa");
  assert.equal(selectApprovalWorkflow([sameTimeA, sameTimeB], {})?.id, "aaa");
});

test("selectApprovalWorkflow does not reorder the caller's array", () => {
  const list = [wf("b", "2026-02-01"), wf("a", "2026-01-01")];
  selectApprovalWorkflow(list, {});
  assert.deepEqual(list.map((w) => w.id), ["b", "a"]);
});

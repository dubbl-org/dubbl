import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billBalancesAfterApply,
  billBalancesAfterUnapply,
  sumByDocument,
} from "../lib/api/debit-note-balances";

const TODAY = "2026-10-13";

test("applying part of a bill leaves it part paid", () => {
  assert.deepEqual(billBalancesAfterApply({ amountPaid: 0, amountDue: 10000 }, 2500), {
    amountPaid: 2500,
    amountDue: 7500,
    status: "partial",
  });
});

test("applying the whole amount due marks the bill paid", () => {
  assert.deepEqual(billBalancesAfterApply({ amountPaid: 4000, amountDue: 6000 }, 6000), {
    amountPaid: 10000,
    amountDue: 0,
    status: "paid",
  });
});

test("apply then unapply restores the original balances", () => {
  const before = { total: 10000, amountPaid: 0, amountDue: 10000, dueDate: "2026-12-01" };
  const applied = billBalancesAfterApply(before, 10000);
  const restored = billBalancesAfterUnapply({ ...before, ...applied }, 10000, TODAY);
  assert.deepEqual(restored, { amountPaid: 0, amountDue: 10000, status: "received" });
});

test("unapply keeps a real payment and leaves the bill part paid", () => {
  // $40 paid in cash, $60 settled by the credit; cancelling the credit puts $60 back.
  const after = billBalancesAfterUnapply(
    { total: 10000, amountPaid: 10000, amountDue: 0, dueDate: "2026-12-01" },
    6000,
    TODAY
  );
  assert.deepEqual(after, { amountPaid: 4000, amountDue: 6000, status: "partial" });
});

test("unapply on a bill past its due date makes it overdue", () => {
  const after = billBalancesAfterUnapply(
    { total: 10000, amountPaid: 2500, amountDue: 7500, dueDate: "2026-09-30" },
    2500,
    TODAY
  );
  assert.deepEqual(after, { amountPaid: 0, amountDue: 10000, status: "overdue" });
});

test("unapply never puts more back than the bill total", () => {
  const after = billBalancesAfterUnapply(
    { total: 10000, amountPaid: 500, amountDue: 9800, dueDate: "2026-12-01" },
    500,
    TODAY
  );
  assert.equal(after.amountDue, 10000);
  assert.equal(after.amountPaid, 0);
});

test("sumByDocument totals several applications to the same bill", () => {
  const m = sumByDocument([
    { documentId: "a", amount: 100 },
    { documentId: "b", amount: 250 },
    { documentId: "a", amount: 50 },
  ]);
  assert.equal(m.get("a"), 150);
  assert.equal(m.get("b"), 250);
});

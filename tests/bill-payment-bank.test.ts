import { test } from "node:test";
import assert from "node:assert/strict";
import { bankAccountCurrencyError } from "../lib/api/payment-bank-currency";
import { scheduledPaymentGroup } from "../lib/scheduled-payment-groups";

test("bankAccountCurrencyError allows a bank account in the bill's currency", () => {
  assert.equal(bankAccountCurrencyError("USD", "USD", "USD"), null);
  assert.equal(bankAccountCurrencyError("EUR", "EUR", "USD"), null);
});

test("bankAccountCurrencyError allows a base-currency account to pay a foreign bill", () => {
  assert.equal(bankAccountCurrencyError("USD", "EUR", "USD"), null);
});

test("bankAccountCurrencyError rejects a foreign account paying another currency", () => {
  assert.match(
    bankAccountCurrencyError("EUR", "USD", "USD") ?? "",
    /bill is in USD but the bank account is in EUR\. Pay it from a bank account in USD\.$/
  );
  assert.match(
    bankAccountCurrencyError("GBP", "EUR", "USD", "invoice") ?? "",
    /invoice is in EUR .* in EUR or USD\.$/
  );
});

test("scheduledPaymentGroup groups finished payments by status, not date", () => {
  const today = "2026-10-13";
  assert.equal(scheduledPaymentGroup("completed", "2026-09-01", today), "Completed");
  assert.equal(scheduledPaymentGroup("failed", "2026-09-01", today), "Failed");
  assert.equal(scheduledPaymentGroup("cancelled", "2026-12-01", today), "Cancelled");
});

test("scheduledPaymentGroup groups waiting payments by date", () => {
  const today = "2026-10-13";
  assert.equal(scheduledPaymentGroup("pending", "2026-10-12", today), "Overdue");
  assert.equal(scheduledPaymentGroup("pending", "2026-10-13", today), "Today");
  assert.equal(scheduledPaymentGroup("pending", "2026-10-20", today), "This Week");
  assert.equal(scheduledPaymentGroup("pending", "2026-10-27", today), "Next Week");
  assert.equal(scheduledPaymentGroup("processing", "2026-11-12", today), "This Month");
  assert.equal(scheduledPaymentGroup("pending", "2026-11-13", today), "Later");
  // Across a DST change the day count stays whole.
  assert.equal(scheduledPaymentGroup("pending", "2026-11-03", "2026-10-27"), "This Week");
});

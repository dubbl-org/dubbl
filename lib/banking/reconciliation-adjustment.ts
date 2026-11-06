/**
 * Writing off a leftover reconciliation difference ("Write off the
 * difference"). Pure, so the route, the MCP tool and the tests share it.
 *
 * The write-off goes to dedicated "Bank Reconciliation Adjustments" accounts.
 * Their codes are engine roles (see CANONICAL_CODES in lib/api/account-roles.ts)
 * that no chart template uses, so they're created on demand: at these codes on
 * a legacy chart, and at a free code in the template's own range on a
 * role-mapped chart. Never reuse codes like 4920 / 5940, which are the
 * unrealised currency accounts in the generic chart and something else
 * entirely in country charts (4920 is Telephone in SKR03).
 */
export const RECONCILIATION_ADJUSTMENT_ACCOUNTS = {
  // The statement shows more than the books: record the extra as income.
  income: {
    code: "4940",
    name: "Bank Reconciliation Adjustments (Income)",
    type: "revenue" as const,
    subType: "non_operating",
  },
  // The books show more than the statement: record the shortfall as an expense.
  expense: {
    code: "5950",
    name: "Bank Reconciliation Adjustments (Expense)",
    type: "expense" as const,
    subType: "non_operating",
  },
};

export interface AdjustmentLine {
  accountId: string;
  debitAmount: number;
  creditAmount: number;
}

/** Which adjustment account a signed difference (cents) is written off to. */
export function adjustmentAccountFor(amount: number) {
  return amount > 0
    ? RECONCILIATION_ADJUSTMENT_ACCOUNTS.income
    : RECONCILIATION_ADJUSTMENT_ACCOUNTS.expense;
}

/**
 * The two balanced lines of a write-off. `amount` is the signed difference in
 * cents (statement minus books): above zero debits the bank and credits the
 * adjustment account, below zero credits the bank and debits it.
 */
export function buildReconciliationAdjustmentLines(params: {
  amount: number;
  bankGlAccountId: string;
  adjustmentAccountId: string;
}): AdjustmentLine[] {
  if (!Number.isInteger(params.amount) || params.amount === 0) {
    throw new Error("Adjustment amount must be a non-zero whole number of cents.");
  }
  const abs = Math.abs(params.amount);
  const moneyIn = params.amount > 0;
  return [
    {
      accountId: params.bankGlAccountId,
      debitAmount: moneyIn ? abs : 0,
      creditAmount: moneyIn ? 0 : abs,
    },
    {
      accountId: params.adjustmentAccountId,
      debitAmount: moneyIn ? 0 : abs,
      creditAmount: moneyIn ? abs : 0,
    },
  ];
}

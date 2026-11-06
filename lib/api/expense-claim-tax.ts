/**
 * Pure tax maths for posting an approved expense claim. No DB access, so it can
 * be unit tested (tests/expense-claim-tax.test.ts).
 *
 * Expense item amounts are TAX-INCLUSIVE (what the employee actually paid), the
 * same convention as a categorized bank line, and each item is split exactly
 * the way createCategorizationJournalEntry splits a money-out bank line:
 *   • no rate / 0% / exempt / no_vat → whole amount to the expense account
 *   • sales_tax_us → non-recoverable on purchases, absorbed into the expense
 *   • reverse_charge → the amount IS the net (the supplier charged no VAT); the
 *     buyer self-accounts notional VAT: DR Input VAT (recoverable slice), CR
 *     Output VAT (full rate x net), any blocked slice absorbed into the expense
 *   • standard / blocked / partial_block → gross split into net + tax; the
 *     recoverable slice of the tax goes to Input VAT, the blocked slice stays
 *     in the expense
 * All amounts are integer cents. Rates and recoverablePercent are basis points.
 */

/** The parts of a tax_rate row that drive posting. */
export interface ExpenseTaxRate {
  rate: number;
  kind: string;
  recoverablePercent: number;
}

/** How one expense item posts. Debits = expenseDebit + inputTax; credits = gross + outputTax. */
export interface ExpenseItemTaxSplit {
  /** Tax-inclusive amount the employee is owed for this item. */
  gross: number;
  /** Tax on the item: the tax included in the gross, or for reverse charge the
   * self-accounted notional tax. Recoverable or not; for display. */
  tax: number;
  /** DR to the item's expense account (net plus any irrecoverable tax). */
  expenseDebit: number;
  /** DR to the Input VAT / GST Receivable control account. */
  inputTax: number;
  /** CR to the Output VAT control account (reverse charge only). */
  outputTax: number;
}

export function splitExpenseItemTax(
  gross: number,
  tax: ExpenseTaxRate | null | undefined
): ExpenseItemTaxSplit {
  const none = { gross, tax: 0, expenseDebit: gross, inputTax: 0, outputTax: 0 };
  if (
    !tax ||
    tax.rate <= 0 ||
    gross <= 0 ||
    tax.kind === "exempt" ||
    tax.kind === "no_vat"
  ) {
    return none;
  }

  if (tax.kind === "reverse_charge") {
    const notional = Math.round((gross * tax.rate) / 10000);
    const recoverable = Math.round((notional * tax.recoverablePercent) / 10000);
    return {
      gross,
      tax: notional,
      expenseDebit: gross + (notional - recoverable),
      inputTax: recoverable,
      outputTax: notional,
    };
  }

  // Tax-inclusive split, identical to splitGrossTax in journal-automation.ts.
  const taxAmount = Math.round((gross * tax.rate) / (10000 + tax.rate));
  // US sales tax is never recoverable on a purchase: all of it stays in cost.
  const recoverablePercent = tax.kind === "sales_tax_us" ? 0 : tax.recoverablePercent;
  const recoverable = Math.round((taxAmount * recoverablePercent) / 10000);
  // Net is the residual so expenseDebit + inputTax === gross to the cent.
  return {
    gross,
    tax: taxAmount,
    expenseDebit: gross - recoverable,
    inputTax: recoverable,
    outputTax: 0,
  };
}

/**
 * Split every item of a claim and total the control-account legs. The payable
 * credit is the sum of the gross amounts (what the employee is reimbursed), so
 * the entry always balances:
 *   sum(expenseDebit) + inputTax === payable + outputTax
 * `items` in the result lines up with the input; an item with a zero or
 * negative amount gets null (it posts nothing).
 */
export function splitExpenseClaimTax(
  items: { amount: number; tax?: ExpenseTaxRate | null }[]
): { items: (ExpenseItemTaxSplit | null)[]; inputTax: number; outputTax: number; payable: number } {
  const splits: (ExpenseItemTaxSplit | null)[] = [];
  let inputTax = 0;
  let outputTax = 0;
  let payable = 0;
  for (const item of items) {
    if (item.amount <= 0) {
      splits.push(null);
      continue;
    }
    const s = splitExpenseItemTax(item.amount, item.tax);
    splits.push(s);
    inputTax += s.inputTax;
    outputTax += s.outputTax;
    payable += s.gross;
  }
  return { items: splits, inputTax, outputTax, payable };
}

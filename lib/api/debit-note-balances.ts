/**
 * Pure balance math for supplier credits (debit notes) applied to bills.
 * No DB access, so it can be unit tested. All amounts are integer cents.
 */

export type OpenBillStatus = "received" | "partial" | "paid" | "overdue";

/** Bill balances after a supplier credit of `amount` is applied to it. */
export function billBalancesAfterApply(
  b: { amountPaid: number; amountDue: number },
  amount: number
): { amountPaid: number; amountDue: number; status: OpenBillStatus } {
  const amountPaid = b.amountPaid + amount;
  const amountDue = Math.max(0, b.amountDue - amount);
  return { amountPaid, amountDue, status: amountDue <= 0 ? "paid" : "partial" };
}

/**
 * Bill balances after `applied` cents of supplier credit are taken back off it
 * (the credit was cancelled). The amount goes back onto what's owed; the status
 * follows what's left: still fully settled by other payments stays 'paid', past
 * its due date becomes 'overdue', otherwise 'partial' if something is still
 * paid, or 'received' (in your books, nothing paid) if not.
 * `today` is YYYY-MM-DD.
 */
export function billBalancesAfterUnapply(
  b: { total: number; amountPaid: number; amountDue: number; dueDate: string },
  applied: number,
  today: string
): { amountPaid: number; amountDue: number; status: OpenBillStatus } {
  const amountPaid = Math.max(0, b.amountPaid - applied);
  const amountDue = Math.min(b.total, b.amountDue + applied);
  let status: OpenBillStatus;
  if (amountDue <= 0) status = "paid";
  else if (b.dueDate < today) status = "overdue";
  else if (amountPaid > 0) status = "partial";
  else status = "received";
  return { amountPaid, amountDue, status };
}

/** Sum application amounts per document id (e.g. per bill). */
export function sumByDocument(
  rows: { documentId: string; amount: number }[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.documentId, (out.get(r.documentId) ?? 0) + r.amount);
  return out;
}

/**
 * Cash-basis recognition: the pure maths.
 *
 * On the cash basis an invoice or bill counts when it is paid, not when it is
 * issued. The ledger only holds the document's accrual entry (DR receivables /
 * CR income / CR output VAT for an invoice; DR costs / DR input VAT / CR
 * payables for a bill) plus a payment entry (DR bank / CR receivables), so
 * cash-basis reports rebuild the realised part of each document entry:
 *
 *   every settlement of the document (a payment allocation, or a credit note /
 *   customer credit applied to it) realises `amount / document total` of the
 *   document's journal entry, dated on the settlement date.
 *
 * Credit notes and supplier debit notes are realised the same way, by their
 * own allocation when they are applied to an invoice or bill (or refunded), so
 * a bill settled partly by a debit note realises the bill's cost for that part
 * and the debit note takes the same part back out.
 *
 * So a $120 invoice ($100 income + $20 VAT) paid $60 in March and $60 in April
 * shows $50 income + $10 VAT in March and the same again in April. The realised
 * slices are balanced journal fragments (their receivables leg nets against the
 * payment's receivables credit), so a cash-basis trial balance still balances.
 *
 * Rounding: each slice is the difference between the cumulative realised
 * amount after and before the settlement, and every cumulative figure splits
 * one rounded target across the debit lines and across the credit lines with
 * largest-remainder rounding. Slices are therefore balanced to the cent, and a
 * fully paid document realises exactly its whole entry.
 *
 * Everything here is pure (no DB) so it can be unit tested; the loaders live in
 * lib/reports/gl-query.ts and lib/reports/tax-return.ts.
 */

/**
 * Entry source types that are cash by nature: they count on the cash basis on
 * their own date. Any other entry that touches a bank account (subType 'bank')
 * counts too. Invoice, bill, credit note and debit note entries count through
 * {@link realiseDocument} instead, on the dates they are settled.
 */
export const CASH_SOURCE_TYPES = [
  "payment",
  "bank_categorization",
  "bank",
  "sales_receipt",
  "sales_receipt_void",
] as const;

/** Document types whose accrual entries are realised by their settlements. */
export const CASH_REALISED_DOCUMENT_TYPES = ["invoice", "bill", "credit_note", "debit_note"] as const;
export type CashRealisedDocumentType = (typeof CASH_REALISED_DOCUMENT_TYPES)[number];

/** A journal line of a document's accrual entry. Amounts in integer cents. */
export interface EntryLine {
  id: string;
  debit: number;
  credit: number;
}

/** One settlement of a document: an allocated amount (document currency). */
export interface Settlement {
  id: string;
  /** ISO date (YYYY-MM-DD) the settlement happened. */
  date: string;
  /** Allocated amount in the document's currency, integer cents. */
  amount: number;
}

/** The part of a document entry realised by one settlement. */
export interface RealisedSlice<L extends EntryLine = EntryLine> {
  settlement: Settlement;
  /** Share of the document this settlement realised (0..1). */
  fraction: number;
  /** Scaled lines; lines that round to zero are dropped. Balanced. */
  lines: Array<L & { debit: number; credit: number }>;
}

/**
 * Split `target` across `weights` in proportion, so the parts sum to exactly
 * `target` (largest-remainder rounding). Weights must be non-negative.
 */
export function splitProportional(weights: number[], target: number): number[] {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || target === 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w * target) / total);
  const parts = exact.map((x) => Math.floor(x));
  let remainder = target - parts.reduce((s, p) => s + p, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0 && k < order.length; k++, remainder--) {
    parts[order[k].i] += 1;
  }
  return parts;
}

/** Order settlements by date, then id, so slices are deterministic. */
function sortSettlements(settlements: Settlement[]): Settlement[] {
  return [...settlements].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  );
}

/**
 * Cumulative realised lines when `paid` of `documentTotal` has been settled.
 * One rounded target per side keeps the result balanced.
 */
function realisedAt(lines: EntryLine[], documentTotal: number, paid: number) {
  const ratio = Math.min(Math.max(paid, 0), documentTotal) / documentTotal;
  const debits = lines.map((l) => Math.max(l.debit, 0));
  const credits = lines.map((l) => Math.max(l.credit, 0));
  const totalDebit = debits.reduce((s, d) => s + d, 0);
  const totalCredit = credits.reduce((s, c) => s + c, 0);
  const d = splitProportional(debits, Math.round(totalDebit * ratio));
  const c = splitProportional(credits, Math.round(totalCredit * ratio));
  return lines.map((_, i) => ({ debit: d[i], credit: c[i] }));
}

/**
 * Realise a document's accrual entry against its settlements.
 *
 * `documentTotal` is the document's gross total in its own currency (the same
 * currency as the settlement amounts). Settlements beyond the total (an
 * overpayment) realise nothing more. Returns one slice per settlement that
 * realised something, in settlement order.
 */
export function realiseDocument<L extends EntryLine>(
  lines: L[],
  documentTotal: number,
  settlements: Settlement[]
): RealisedSlice<L>[] {
  if (documentTotal <= 0 || lines.length === 0) return [];
  const slices: RealisedSlice<L>[] = [];
  let paid = 0;
  let before = lines.map(() => ({ debit: 0, credit: 0 }));
  for (const s of sortSettlements(settlements)) {
    if (s.amount === 0) continue;
    const prevPaid = Math.min(Math.max(paid, 0), documentTotal);
    paid += s.amount;
    const nowPaid = Math.min(Math.max(paid, 0), documentTotal);
    if (nowPaid === prevPaid) continue;
    const after = realisedAt(lines, documentTotal, paid);
    const sliceLines: Array<L & { debit: number; credit: number }> = [];
    lines.forEach((line, i) => {
      const debit = after[i].debit - before[i].debit;
      const credit = after[i].credit - before[i].credit;
      if (debit !== 0 || credit !== 0) sliceLines.push({ ...line, debit, credit });
    });
    before = after;
    slices.push({
      settlement: s,
      fraction: (nowPaid - prevPaid) / documentTotal,
      lines: sliceLines,
    });
  }
  return slices;
}

/**
 * Share of a document realised by settlements dated inside [startDate,
 * endDate] (inclusive; omit startDate for "up to endDate"). Used for figures
 * that come from the document itself rather than its journal lines, such as
 * net sales on a VAT return.
 */
export function realisedFraction(
  documentTotal: number,
  settlements: Settlement[],
  startDate: string | undefined,
  endDate: string
): number {
  if (documentTotal <= 0) return 0;
  let paid = 0;
  let inWindow = 0;
  for (const s of sortSettlements(settlements)) {
    if (s.date > endDate) break;
    const prev = Math.min(Math.max(paid, 0), documentTotal);
    paid += s.amount;
    const now = Math.min(Math.max(paid, 0), documentTotal);
    if (!startDate || s.date >= startDate) inWindow += now - prev;
  }
  return inWindow / documentTotal;
}

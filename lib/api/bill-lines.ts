import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { taxRate } from "@/lib/db/schema";
import { decimalToMinorUnits } from "@/lib/money";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";

/** A bill line as callers send it: quantity and unitPrice are decimals. */
export interface BillLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  accountId?: string | null;
  taxRateId?: string | null;
  discountPercent?: number;
  inventoryItemId?: string | null;
  warehouseId?: string | null;
  projectId?: string | null;
  goodsReceiptLineId?: string | null;
}

/**
 * Turn decimal bill lines into stored lines (minor units, quantity x100) and
 * the bill totals. Shared by bill create and draft edit so both compute the
 * same numbers.
 *
 * rates: taxRateId -> rate in basis points. kinds: taxRateId -> tax kind.
 * Reverse-charge VAT is part of taxTotal/total for reporting but is netted out
 * of amountDue, because the supplier is paid net (the buyer self-accounts it).
 */
export function buildBillLines(
  lines: BillLineInput[],
  currencyCode: string,
  rates: Map<string, number>,
  kinds: Map<string, string> = new Map()
) {
  let subtotal = 0;
  let reverseChargeVat = 0;
  const processed = lines.map((l, i) => {
    const discountPercent = l.discountPercent ?? 0;
    const grossAmount = decimalToMinorUnits(l.quantity * l.unitPrice, currencyCode);
    const discountAmount = discountPercent ? Math.round((grossAmount * discountPercent) / 10000) : 0;
    const amount = grossAmount - discountAmount;
    subtotal += amount;
    const taxRateId = l.taxRateId || null;
    const taxAmount = taxRateId ? calcTax(amount, rates.get(taxRateId) ?? 0) : 0;
    if (taxRateId && kinds.get(taxRateId) === "reverse_charge") reverseChargeVat += taxAmount;
    return {
      description: l.description,
      quantity: Math.round(l.quantity * 100),
      unitPrice: decimalToMinorUnits(l.unitPrice, currencyCode),
      accountId: l.accountId || null,
      taxRateId,
      discountPercent,
      taxAmount,
      amount,
      inventoryItemId: l.inventoryItemId || null,
      warehouseId: l.warehouseId || null,
      projectId: l.projectId || null,
      goodsReceiptLineId: l.goodsReceiptLineId || null,
      sortOrder: i,
    };
  });
  const taxTotal = processed.reduce((s, l) => s + l.taxAmount, 0);
  const total = subtotal + taxTotal;
  return { lines: processed, subtotal, taxTotal, total, amountDue: total - reverseChargeVat };
}

/** Preload the rates and kinds buildBillLines needs for these lines. */
export async function loadBillTaxContext(lines: { taxRateId?: string | null }[]) {
  const ids = [...new Set(lines.map((l) => l.taxRateId).filter(Boolean) as string[])];
  const rates = await preloadTaxRates(ids);
  const kinds = new Map<string, string>();
  if (ids.length > 0) {
    const rows = await db
      .select({ id: taxRate.id, kind: taxRate.kind })
      .from(taxRate)
      .where(inArray(taxRate.id, ids));
    for (const r of rows) kinds.set(r.id, r.kind);
  }
  return { rates, kinds };
}

/**
 * Bill lines ready to post: any line without an account (no account picked,
 * no contact default, not a stock line) takes `fallbackAccountId`, so its cost
 * still reaches the ledger and Accounts Payable matches the bill. Zero lines
 * are dropped. Throws when a non-zero line has nowhere to go, rather than
 * posting an entry that leaves part of the bill out.
 */
export function resolveBillPostingLines<L extends { accountId: string | null; amount: number }>(
  lines: L[],
  fallbackAccountId: string | null
): (L & { accountId: string })[] {
  const out: (L & { accountId: string })[] = [];
  for (const l of lines) {
    if (l.amount === 0) continue;
    const accountId = l.accountId || fallbackAccountId;
    if (!accountId) throw new Error("A bill line has no account to post to. Pick an account on every line.");
    out.push({ ...l, accountId });
  }
  return out;
}

/** Debits minus credits of journal lines (0 means the entry balances). */
export function journalImbalance(lines: { debitAmount?: number | null; creditAmount?: number | null }[]) {
  return lines.reduce((s, l) => s + (l.debitAmount ?? 0) - (l.creditAmount ?? 0), 0);
}

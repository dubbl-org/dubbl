import { decimalToMinorUnits } from "@/lib/money";

/**
 * Line and total math for purchase requisitions, shared by the REST routes and
 * the MCP tools so a requisition (and the purchase order it converts into)
 * always carries the same numbers.
 *
 * Input quantity and unitPrice are decimals (2 units at 12.50). Stored values
 * follow the purchase order convention: quantity x100, unitPrice and every
 * amount in integer minor units (cents) of the requisition's currency. Tax is
 * exclusive, worked out per line from the tax rate in basis points, the same
 * way POST /purchase-orders does.
 */
export interface RequisitionLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  accountId?: string | null;
  taxRateId?: string | null;
}

export interface RequisitionLineRow {
  description: string;
  quantity: number;
  unitPrice: number;
  accountId: string | null;
  taxRateId: string | null;
  taxAmount: number;
  amount: number;
  sortOrder: number;
}

export function buildRequisitionLines(
  lines: RequisitionLineInput[],
  currencyCode: string,
  /** taxRateId -> rate in basis points (1000 = 10%), e.g. from preloadTaxRates */
  rates: Map<string, number>
): { lines: RequisitionLineRow[]; subtotal: number; taxTotal: number; total: number } {
  let subtotal = 0;
  let taxTotal = 0;
  const rows = lines.map((l, i) => {
    const amount = decimalToMinorUnits(l.quantity * l.unitPrice, currencyCode);
    const taxRateId = l.taxRateId || null;
    const taxAmount = taxRateId ? Math.round((amount * (rates.get(taxRateId) ?? 0)) / 10000) : 0;
    subtotal += amount;
    taxTotal += taxAmount;
    return {
      description: l.description,
      quantity: Math.round(l.quantity * 100),
      unitPrice: decimalToMinorUnits(l.unitPrice, currencyCode),
      accountId: l.accountId || null,
      taxRateId,
      taxAmount,
      amount,
      sortOrder: i,
    };
  });
  return { lines: rows, subtotal, taxTotal, total: subtotal + taxTotal };
}

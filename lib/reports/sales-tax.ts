/**
 * Sales tax report arithmetic (pure). See app/api/v1/reports/sales-tax.
 * Amounts are integer cents.
 */

export interface SalesTaxLine {
  invoiceId: string;
  /** Net line amount (before tax). */
  amount: number;
  taxAmount: number;
  taxRate: { id: string; name: string; rate: number; kind: string } | null;
  /** The customer is set to "Don't charge tax to this contact". */
  contactTaxExempt: boolean;
}

export interface SalesTaxRateRow {
  taxRateId: string;
  taxRateName: string;
  taxRatePercent: number;
  taxableAmount: number;
  taxCollected: number;
  invoiceCount: number;
}

/** Rate kinds that never charge tax on a sale. */
const EXEMPT_KINDS = new Set(["exempt", "no_vat"]);

/**
 * A line is exempt when it has no tax rate, an exempt / no-tax / 0% rate, or
 * it is to a customer who isn't charged tax and no tax was put on it. Tax that was
 * actually charged is always reported, whoever the customer is.
 */
export function isExemptLine(line: SalesTaxLine): boolean {
  if (!line.taxRate) return true;
  if ((EXEMPT_KINDS.has(line.taxRate.kind) || line.taxRate.rate === 0) && line.taxAmount === 0) return true;
  return line.contactTaxExempt && line.taxAmount === 0;
}

export function salesTaxBreakdown(lines: SalesTaxLine[]) {
  const byRate = new Map<string, SalesTaxRateRow & { invoices: Set<string> }>();
  let exemptAmount = 0;
  let exemptCustomerAmount = 0;
  const exemptInvoices = new Set<string>();
  for (const line of lines) {
    if (isExemptLine(line)) {
      exemptAmount += line.amount;
      if (line.contactTaxExempt) exemptCustomerAmount += line.amount;
      exemptInvoices.add(line.invoiceId);
      continue;
    }
    const rate = line.taxRate!;
    let row = byRate.get(rate.id);
    if (!row) {
      row = {
        taxRateId: rate.id,
        taxRateName: rate.name,
        taxRatePercent: rate.rate,
        taxableAmount: 0,
        taxCollected: 0,
        invoiceCount: 0,
        invoices: new Set(),
      };
      byRate.set(rate.id, row);
    }
    row.taxableAmount += line.amount;
    row.taxCollected += line.taxAmount;
    row.invoices.add(line.invoiceId);
  }
  const breakdown: SalesTaxRateRow[] = [...byRate.values()]
    .map(({ invoices, ...r }) => ({ ...r, invoiceCount: invoices.size }))
    .sort((a, b) => b.taxCollected - a.taxCollected);
  return {
    breakdown,
    exemptAmount,
    /** Part of exemptAmount sold to customers set to "Don't charge tax". */
    exemptCustomerAmount,
    exemptInvoiceCount: exemptInvoices.size,
    totalTaxable: breakdown.reduce((s, r) => s + r.taxableAmount, 0),
    totalCollected: breakdown.reduce((s, r) => s + r.taxCollected, 0),
    invoiceCount: new Set(lines.map((l) => l.invoiceId)).size,
  };
}

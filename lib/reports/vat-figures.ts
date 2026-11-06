/**
 * VAT / GST return arithmetic (pure, no DB).
 *
 * The tax amounts (VAT due on sales, VAT reclaimed, reverse-charge VAT) come
 * from the ledger control accounts; the turnover figures (net sales, net
 * purchases, exports, GST-free sales, capital purchases) come from the
 * documents. lib/reports/tax-return.ts loads both and hands them here.
 *
 * All amounts are integer cents in the organization's base currency.
 */

/** A document line, in the document's currency. */
export interface TaxDocumentLine {
  /** Net line amount (before tax). */
  amount: number;
  taxAmount: number;
  /** Coded to a fixed-asset account (a capital purchase). */
  capital: boolean;
}

/** A sales or purchase document that feeds the turnover boxes. */
export interface TaxDocument {
  side: "sale" | "purchase";
  /** +1 for invoices, bills and sales receipts; -1 for credit and debit notes. */
  sign: 1 | -1;
  /**
   * Share of the document that falls in the period: 1 on the accrual basis
   * (issued in the period), the realised share on the cash basis.
   */
  weight: number;
  /** Document → base currency rate, scaled by 1,000,000 (1.0 = 1000000). */
  rate: number;
  subtotal: number;
  total: number;
  /** Sold to / bought from a VAT-registered business in another country. */
  crossBorder: boolean;
  lines: TaxDocumentLine[];
}

export interface DocumentFigures {
  /** Sales ex-VAT, net of credit notes. */
  netSales: number;
  /** Sales including VAT, net of credit notes. */
  grossSales: number;
  /** Ex-VAT sales to VAT-registered businesses abroad. */
  crossBorderSales: number;
  /** Ex-VAT sales lines that carried no tax, excluding cross-border sales. */
  taxFreeSales: number;
  /** Purchases ex-VAT, net of debit notes. */
  netPurchases: number;
  /** Purchases including VAT, net of debit notes. */
  grossPurchases: number;
  /** Ex-VAT purchases from VAT-registered businesses abroad. */
  crossBorderPurchases: number;
  /** Capital purchases (fixed-asset lines) including their tax. */
  capitalPurchases: number;
}

const RATE_SCALE = 1_000_000;

/** Convert a document-currency amount to base cents for its share of the period. */
function toBase(amount: number, doc: TaxDocument): number {
  return (amount * doc.sign * doc.weight * doc.rate) / RATE_SCALE;
}

/** Sum the turnover figures across documents (rounded once per figure). */
export function documentFigures(docs: TaxDocument[]): DocumentFigures {
  const f = {
    netSales: 0,
    grossSales: 0,
    crossBorderSales: 0,
    taxFreeSales: 0,
    netPurchases: 0,
    grossPurchases: 0,
    crossBorderPurchases: 0,
    capitalPurchases: 0,
  };
  for (const doc of docs) {
    if (doc.weight === 0) continue;
    const net = toBase(doc.subtotal, doc);
    const gross = toBase(doc.total, doc);
    if (doc.side === "sale") {
      f.netSales += net;
      f.grossSales += gross;
      if (doc.crossBorder) {
        f.crossBorderSales += net;
      } else {
        const free = doc.lines.filter((l) => l.taxAmount === 0).reduce((s, l) => s + l.amount, 0);
        f.taxFreeSales += toBase(free, doc);
      }
    } else {
      f.netPurchases += net;
      f.grossPurchases += gross;
      if (doc.crossBorder) f.crossBorderPurchases += net;
      const capital = doc.lines.filter((l) => l.capital).reduce((s, l) => s + l.amount + l.taxAmount, 0);
      f.capitalPurchases += toBase(capital, doc);
    }
  }
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.round(v)])) as unknown as DocumentFigures;
}

/** A VAT control-account line, keyed by the entry (or realised slice) it belongs to. */
export interface VatLine {
  entryKey: string;
  /** The ledger account (lets filing clear 2200 and 2230 separately). */
  accountId?: string;
  /** "output" = the output VAT account (2200), "input" = input VAT (1500). */
  account: "output" | "input";
  debit: number;
  credit: number;
}

export interface VatTotals {
  /** Output VAT movement, credits − debits (includes reverse-charge VAT). */
  outputVat: number;
  /** Input VAT movement, debits − credits. */
  inputVat: number;
  /**
   * Self-accounted reverse-charge VAT: output VAT credited on entries that also
   * debit input VAT (a purchase never otherwise credits output VAT, and a sale
   * never debits input VAT).
   */
  reverseChargeVat: number;
}

export function vatTotals(lines: VatLine[]): VatTotals {
  const inputDebitKeys = new Set(
    lines.filter((l) => l.account === "input" && l.debit > 0).map((l) => l.entryKey)
  );
  let outputVat = 0;
  let inputVat = 0;
  let reverseChargeVat = 0;
  for (const l of lines) {
    if (l.account === "output") {
      outputVat += l.credit - l.debit;
      if (inputDebitKeys.has(l.entryKey)) reverseChargeVat += l.credit - l.debit;
    } else {
      inputVat += l.debit - l.credit;
    }
  }
  return { outputVat, inputVat, reverseChargeVat };
}

export interface ReturnBox {
  box: string;
  label: string;
  amount: number;
}

/**
 * UK-style 9-box VAT return. Box 1 excludes the reverse-charge VAT, which is
 * reported in Box 2 instead, so Box 3 (= 1 + 2) equals the whole output VAT
 * movement. On the flat-rate scheme Box 1 is the flat percentage (basis
 * points) of VAT-inclusive turnover and Box 4 is 0.
 */
export function vatReturnBoxes(
  totals: VatTotals,
  figures: DocumentFigures,
  flatRatePercent?: number | null
): ReturnBox[] {
  const flat = flatRatePercent != null && Number.isFinite(flatRatePercent) && flatRatePercent > 0;
  const box1 = flat
    ? Math.round((figures.grossSales * flatRatePercent!) / 10000)
    : totals.outputVat - totals.reverseChargeVat;
  const box2 = flat ? 0 : totals.reverseChargeVat;
  const box4 = flat ? 0 : totals.inputVat;
  const box3 = box1 + box2;
  return [
    { box: "1", label: "VAT due on sales", amount: box1 },
    { box: "2", label: "VAT due on EU acquisitions", amount: box2 },
    { box: "3", label: "Total VAT due (Box 1 + 2)", amount: box3 },
    { box: "4", label: "VAT reclaimed on purchases", amount: box4 },
    { box: "5", label: "Net VAT to pay/reclaim (Box 3 - 4)", amount: box3 - box4 },
    { box: "6", label: "Total sales ex-VAT", amount: figures.netSales },
    { box: "7", label: "Total purchases ex-VAT", amount: figures.netPurchases },
    { box: "8", label: "Total supplies to EU ex-VAT", amount: figures.crossBorderSales },
    { box: "9", label: "Total acquisitions from EU ex-VAT", amount: figures.crossBorderPurchases },
  ];
}

/**
 * Australian BAS GST fields. G1 is total sales including GST; G2 exports;
 * G3 other GST-free sales; G10 capital and G11 non-capital purchases (both
 * including GST); 1A GST on sales; 1B GST on purchases.
 */
export function basFields(totals: VatTotals, figures: DocumentFigures): (Omit<ReturnBox, "box"> & { field: string })[] {
  const oneA = totals.outputVat;
  const oneB = totals.inputVat;
  return [
    { field: "G1", label: "Total sales (including GST)", amount: figures.grossSales },
    { field: "G2", label: "Export sales", amount: figures.crossBorderSales },
    { field: "G3", label: "Other GST-free sales", amount: figures.taxFreeSales },
    { field: "G10", label: "Capital purchases", amount: figures.capitalPurchases },
    { field: "G11", label: "Non-capital purchases", amount: figures.grossPurchases - figures.capitalPurchases },
    { field: "1A", label: "GST on sales", amount: oneA },
    { field: "1B", label: "GST on purchases", amount: oneB },
    { field: "NET", label: "Net GST (1A - 1B)", amount: oneA - oneB },
  ];
}

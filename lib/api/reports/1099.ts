/**
 * 1099-NEC / 1099-MISC reporting (US).
 *
 * Extracted from lib/api/tax-profiles.ts: the tax profiles are now a view over
 * the jurisdiction modules, and this is a report, not a tax-rate concern.
 *
 * 1099 reports are CASH basis, so this sums actual `payment` records to
 * suppliers, not bill totals. Card payments are EXCLUDED — the processor
 * reports those on 1099-K and the payer must not report them again.
 */
import { db } from "@/lib/db";
import { payment, contact } from "@/lib/db/schema";
import { eq, and, ne, gte, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";

/** The federal reporting threshold for 1099-NEC nonemployee compensation. */
export const FORM_1099_NEC_THRESHOLD_CENTS = 60000; // $600.00

export interface Vendor1099Summary {
  contactId: string;
  name: string;
  /** TIN/SSN/EIN as captured on the W-9 (contact.taxIdentifier). */
  taxIdentifier: string | null;
  /** W-9 federal tax classification (contact.w9TaxClassification). */
  w9TaxClassification: string | null;
  /** Subject to 24% backup withholding (contact.backupWithholding). */
  backupWithholding: boolean;
  /** Total reportable payments in the year (cents), excluding card payments. */
  totalPaid: number;
  /** Number of payments that made up totalPaid. */
  paymentCount: number;
  /** True when totalPaid meets/exceeds the $600 1099-NEC reporting threshold. */
  reportable: boolean;
}

export interface Report1099 {
  taxYear: number;
  startDate: string;
  endDate: string;
  /** Reporting threshold applied (cents). */
  threshold: number;
  /** Per-vendor summaries (sorted by totalPaid descending). */
  vendors: Vendor1099Summary[];
  /** Vendors at or above the threshold (a 1099 must be filed for these). */
  reportableCount: number;
  /** Grand total of reportable (>= threshold) vendor payments, in cents. */
  reportableTotal: number;
  /** Grand total across all 1099 vendors regardless of threshold, in cents. */
  grandTotal: number;
}

/**
 * Build the 1099 summary for a calendar tax year. Sums non-card supplier
 * payments per 1099 vendor and flags those at/above the $600 threshold.
 *
 * @param taxYear four-digit calendar year (e.g. 2025)
 * @param thresholdCents override the $600 reporting threshold (cents)
 */
export async function build1099Report(
  organizationId: string,
  taxYear: number,
  thresholdCents: number = FORM_1099_NEC_THRESHOLD_CENTS
): Promise<Report1099> {
  const startDate = `${taxYear}-01-01`;
  const endDate = `${taxYear}-12-31`;

  const vendors = await db.query.contact.findMany({
    where: and(
      eq(contact.organizationId, organizationId),
      eq(contact.is1099Vendor, true),
      notDeleted(contact.deletedAt)
    ),
    columns: {
      id: true,
      name: true,
      taxIdentifier: true,
      w9TaxClassification: true,
      backupWithholding: true,
    },
  });

  const payments = await db.query.payment.findMany({
    where: and(
      eq(payment.organizationId, organizationId),
      eq(payment.type, "made"),
      ne(payment.method, "card"),
      gte(payment.date, startDate),
      lte(payment.date, endDate),
      notDeleted(payment.deletedAt)
    ),
    columns: { contactId: true, amount: true },
  });

  const totals = new Map<string, { total: number; count: number }>();
  for (const p of payments) {
    const cur = totals.get(p.contactId) ?? { total: 0, count: 0 };
    cur.total += p.amount;
    cur.count += 1;
    totals.set(p.contactId, cur);
  }

  const summaries: Vendor1099Summary[] = vendors.map((v) => {
    const agg = totals.get(v.id) ?? { total: 0, count: 0 };
    return {
      contactId: v.id,
      name: v.name,
      taxIdentifier: v.taxIdentifier ?? null,
      w9TaxClassification: v.w9TaxClassification ?? null,
      backupWithholding: v.backupWithholding,
      totalPaid: agg.total,
      paymentCount: agg.count,
      reportable: agg.total >= thresholdCents,
    };
  });

  summaries.sort((a, b) => b.totalPaid - a.totalPaid);

  const reportable = summaries.filter((s) => s.reportable);

  return {
    taxYear,
    startDate,
    endDate,
    threshold: thresholdCents,
    vendors: summaries,
    reportableCount: reportable.length,
    reportableTotal: reportable.reduce((s, v) => s + v.totalPaid, 0),
    grandTotal: summaries.reduce((s, v) => s + v.totalPaid, 0),
  };
}

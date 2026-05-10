// Cross-field validation and overall confidence scoring.
//
// Receipts have known internal arithmetic: subtotal + tax ≈ total. When they
// match, we boost the confidence of all three fields. When they don't, we add a
// warning so the user is prompted to double-check.

import type { ScanFields } from "../types";

export function validateAndScore(fields: ScanFields): {
  warnings: string[];
  overallConfidence: number;
} {
  const warnings: string[] = [];

  const t = fields.total.value;
  const s = fields.subtotal.value;
  const x = fields.tax.value;

  // 1) subtotal + tax = total within 1 cent → boost confidences.
  if (t != null && s != null && x != null) {
    const expected = s + x;
    const diff = Math.abs(expected - t);
    if (diff <= 2) {
      fields.total.confidence = clamp01(fields.total.confidence + 0.1);
      fields.subtotal.confidence = clamp01(fields.subtotal.confidence + 0.1);
      fields.tax.confidence = clamp01(fields.tax.confidence + 0.1);
    } else if (diff > Math.max(50, t * 0.05)) {
      warnings.push(
        `subtotal (${centsLabel(s)}) + tax (${centsLabel(x)}) ≠ total (${centsLabel(t)})`
      );
    }
  }

  // 2) tax should be < subtotal/total.
  if (t != null && x != null && x > t) {
    warnings.push("tax is greater than total — likely misread");
    fields.tax.confidence = clamp01(fields.tax.confidence - 0.3);
  }

  // 3) line items sum should match subtotal/total within tolerance.
  if (fields.lineItems.length > 0) {
    const sum = fields.lineItems.reduce(
      (acc, li) => acc + (li.amount.value ?? 0),
      0
    );
    const target = s ?? t;
    if (target != null) {
      const diff = Math.abs(sum - target);
      if (diff > Math.max(100, target * 0.1)) {
        warnings.push(`line item total (${centsLabel(sum)}) ≠ subtotal/total (${centsLabel(target)})`);
      }
    }
  }

  // 4) date sanity.
  if (fields.date.value) {
    const y = Number(fields.date.value.slice(0, 4));
    const now = new Date().getUTCFullYear();
    if (y < now - 5 || y > now + 1) {
      warnings.push(`date year (${y}) is outside the expected range`);
      fields.date.confidence = clamp01(fields.date.confidence - 0.2);
    }
  }

  // Overall confidence: weighted by importance.
  const w = {
    vendor: 1.0,
    date: 1.5,
    total: 2.5,
    currency: 0.7,
    tax: 0.5,
    subtotal: 0.3,
  };
  const wsum = Object.values(w).reduce((a, b) => a + b, 0);
  const score =
    fields.vendor.confidence * w.vendor +
    fields.date.confidence * w.date +
    fields.total.confidence * w.total +
    fields.currency.confidence * w.currency +
    fields.tax.confidence * w.tax +
    fields.subtotal.confidence * w.subtotal;

  return { warnings, overallConfidence: clamp01(score / wsum) };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function centsLabel(c: number): string {
  return (c / 100).toFixed(2);
}

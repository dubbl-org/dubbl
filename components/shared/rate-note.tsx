import Link from "next/link";
import { cn } from "@/lib/utils";

/** Mirrors lib/currency/rate-status.ts RateStatus (the JSON shape from the API). */
export interface RateInfo {
  rate: number | null;
  origin: "same" | "manual" | "api" | "manual-inverse" | "api-inverse" | null;
  effectiveDate: string | null;
  ageDays: number | null;
  stale: boolean;
  missing: boolean;
}

function formatRate(rate: number): string {
  return (rate / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

/**
 * One compact line describing the exchange rate behind a base-currency figure:
 * the rate itself, whether it was entered manually or fetched automatically,
 * its date, a stale warning, or — when no rate exists — a prompt to set a
 * custom one. Renders nothing when the document is already in the base currency.
 */
export function RateNote({
  currency,
  baseCurrency,
  status,
  className,
}: {
  currency: string;
  baseCurrency: string;
  status: RateInfo | null | undefined;
  className?: string;
}) {
  if (!status || !baseCurrency || baseCurrency === currency) return null;

  if (status.missing) {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-1 text-xs text-amber-600", className)}>
        No {currency}→{baseCurrency} rate available.{" "}
        <Link href="/tax/currencies" className="font-medium underline underline-offset-2">
          Set a custom rate
        </Link>
      </span>
    );
  }

  const isManual = status.origin === "manual" || status.origin === "manual-inverse";

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground", className)}>
      {status.rate != null && (
        <span className="tabular-nums">
          1 {currency} ≈ {formatRate(status.rate)} {baseCurrency}
        </span>
      )}
      <span>·</span>
      {isManual ? (
        <span className="font-medium text-blue-600">Manual rate</span>
      ) : (
        <span>Auto rate</span>
      )}
      {status.effectiveDate && <span>· {status.effectiveDate}</span>}
      {status.stale && status.ageDays != null && (
        <span className="font-medium text-amber-600">· {status.ageDays}d old</span>
      )}
    </span>
  );
}

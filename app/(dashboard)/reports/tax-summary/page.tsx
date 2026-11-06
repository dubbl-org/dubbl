"use client";

import { Fragment, useState } from "react";
import { Receipt, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BackToReports, ReportHelp } from "../_components";
import { useApi } from "@/lib/query/use-api";

interface TaxRateSummary {
  taxRateId: string;
  taxRateName: string;
  rate: number;
  type: string;
  outputTax: number;
  outputNet: number;
  outputTransactions: number;
  inputTax: number;
  inputNet: number;
  inputTransactions: number;
  netTax: number;
  /** Compound rates: the tax shared between the parts. */
  parts?: { name: string; rate: number; outputTax: number; inputTax: number }[];
}

/** Honor ?startDate/&endDate when arriving from a tax-return drill-down link. */
function initialDates() {
  const now = new Date();
  const fallback = { start: `${now.getFullYear()}-01-01`, end: now.toISOString().slice(0, 10) };
  if (typeof window === "undefined") return fallback;
  const p = new URLSearchParams(window.location.search);
  return {
    start: p.get("startDate") || fallback.start,
    end: p.get("endDate") || fallback.end,
  };
}

export default function TaxSummaryPage() {
  const [dates] = useState(initialDates);
  const [startDate, setStartDate] = useState(dates.start);
  const [endDate, setEndDate] = useState(dates.end);
  const { data, loading } = useApi<{ rates?: TaxRateSummary[]; totalOutputTax?: number; totalInputTax?: number; netTaxPayable?: number }>(
    `/api/v1/reports/tax-summary?${new URLSearchParams({ startDate, endDate })}`,
    { keepPrevious: true }
  );
  const rates = data?.rates || [];
  const totalOutputTax = data?.totalOutputTax || 0;
  const totalInputTax = data?.totalInputTax || 0;
  const netTaxPayable = data?.netTaxPayable || 0;

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />

      <PageHeader
        title="Tax collected vs tax paid"
        description="Tax you charged on sales vs tax you paid on purchases, by tax rate."
      >
        <Button asChild variant="outline" size="sm">
          <a href="/reports/vat-return">Open the full tax return</a>
        </Button>
      </PageHeader>

      <ReportHelp>
        A breakdown by tax rate of the tax you added to customer invoices and the
        tax you paid on supplier bills. The difference is roughly what you&apos;ll pay
        to (or get back from) the tax office.
      </ReportHelp>

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      <ContentReveal>
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title="Tax you charged on sales"
              value={formatMoney(totalOutputTax)}
              icon={ArrowUpRight}
              changeType="neutral"
            />
            <StatCard
              title="Tax you paid on purchases"
              value={formatMoney(totalInputTax)}
              icon={ArrowDownLeft}
              changeType="neutral"
            />
            <StatCard
              title={netTaxPayable >= 0 ? "You'll owe the tax office" : "You'll get a refund"}
              value={formatMoney(Math.abs(netTaxPayable))}
              icon={Receipt}
              changeType={netTaxPayable > 0 ? "negative" : "positive"}
            />
          </div>

          {rates.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center">
              <p className="text-sm text-muted-foreground">No tax activity for this period.</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Tax rate</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Rate</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Sales (before tax)</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Tax charged</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Purchases (before tax)</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Tax paid</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Owe / refund</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r) => (
                    <Fragment key={r.taxRateId}>
                    <tr className="border-b last:border-b-0">
                      <td className="px-4 py-2.5 font-medium">{r.taxRateName}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                        {(r.rate / 100).toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatMoney(r.outputNet)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-600">{formatMoney(r.outputTax)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatMoney(r.inputNet)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-orange-600">{formatMoney(r.inputTax)}</td>
                      <td className={cn(
                        "px-4 py-2.5 text-right font-mono tabular-nums font-medium",
                        r.netTax >= 0 ? "text-red-600" : "text-brand-600"
                      )}>
                        {formatMoney(Math.abs(r.netTax))}
                        {r.netTax < 0 ? " refund" : " due"}
                      </td>
                    </tr>
                    {(r.parts ?? []).map((p, i) => (
                      <tr key={`${r.taxRateId}-${i}`} className="border-b last:border-b-0 text-muted-foreground">
                        <td className="py-2 pl-8 pr-4 text-xs">{p.name}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">{(p.rate / 100).toFixed(2)}%</td>
                        <td className="px-4 py-2" />
                        <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">{formatMoney(p.outputTax)}</td>
                        <td className="px-4 py-2" />
                        <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">{formatMoney(p.inputTax)}</td>
                        <td className="px-4 py-2" />
                      </tr>
                    ))}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td className="px-4 py-2.5 font-semibold" colSpan={3}>Total</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-blue-600">{formatMoney(totalOutputTax)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold" />
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-orange-600">{formatMoney(totalInputTax)}</td>
                    <td className={cn(
                      "px-4 py-2.5 text-right font-mono tabular-nums font-semibold",
                      netTaxPayable >= 0 ? "text-red-600" : "text-brand-600"
                    )}>
                      {formatMoney(Math.abs(netTaxPayable))}
                      {netTaxPayable < 0 ? " refund" : " due"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </ContentReveal>
    </ContentReveal>
  );
}

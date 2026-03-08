"use client";

import { useState, useEffect } from "react";
import { Receipt, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

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
}

export default function TaxSummaryPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [rates, setRates] = useState<TaxRateSummary[]>([]);
  const [totalOutputTax, setTotalOutputTax] = useState(0);
  const [totalInputTax, setTotalInputTax] = useState(0);
  const [netTaxPayable, setNetTaxPayable] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    const params = new URLSearchParams({ startDate, endDate });
    fetch(`/api/v1/reports/tax-summary?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRates(data.rates || []);
        setTotalOutputTax(data.totalOutputTax || 0);
        setTotalInputTax(data.totalInputTax || 0);
        setNetTaxPayable(data.netTaxPayable || 0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax Summary"
        description="Output tax (sales) vs input tax (purchases) by tax rate."
      />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Output Tax (Sales)"
          value={formatMoney(totalOutputTax)}
          icon={ArrowUpRight}
          changeType="neutral"
        />
        <StatCard
          title="Input Tax (Purchases)"
          value={formatMoney(totalInputTax)}
          icon={ArrowDownLeft}
          changeType="neutral"
        />
        <StatCard
          title="Net Tax Payable"
          value={formatMoney(netTaxPayable)}
          icon={Receipt}
          changeType={netTaxPayable > 0 ? "negative" : "positive"}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : rates.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No tax activity for this period.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Tax Rate</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Rate</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Output Net</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Output Tax</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Input Net</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Input Tax</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Net Tax</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.taxRateId} className="border-b last:border-b-0">
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
                    r.netTax >= 0 ? "text-red-600" : "text-emerald-600"
                  )}>
                    {formatMoney(Math.abs(r.netTax))}
                    {r.netTax < 0 ? " refund" : " due"}
                  </td>
                </tr>
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
                  netTaxPayable >= 0 ? "text-red-600" : "text-emerald-600"
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
  );
}

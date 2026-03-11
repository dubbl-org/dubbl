"use client";

import { useState, useCallback } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";

interface TaxBreakdown {
  taxRateName: string | null;
  taxRatePercent: number | null;
  taxableAmount: number;
  taxCollected: number;
  invoiceCount: number;
}

export default function SalesTaxPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [breakdown, setBreakdown] = useState<TaxBreakdown[]>([]);
  const [exemptAmount, setExemptAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = useCallback(async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`/api/v1/reports/sales-tax?${params}`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      setBreakdown(data.breakdown || []);
      setExemptAmount(data.exemptAmount || 0);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const totalTaxable = breakdown.reduce((sum, b) => sum + b.taxableAmount, 0);
  const totalCollected = breakdown.reduce((sum, b) => sum + b.taxCollected, 0);
  const totalInvoices = breakdown.reduce((sum, b) => sum + b.invoiceCount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Tax Report"
        description="US state sales tax breakdown by rate"
      />

      <div className="flex items-end gap-4">
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
        />
        <Button onClick={generate} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
          {loading ? "Generating..." : "Generate"}
        </Button>
      </div>

      {!generated ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">Select a date range and click Generate to calculate sales tax.</p>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Tax Rate</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Rate %</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Taxable Amount</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Tax Collected</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Invoices</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((b, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">{b.taxRateName || "No tax rate"}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {b.taxRatePercent != null ? `${(b.taxRatePercent / 100).toFixed(2)}%` : "-"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatMoney(b.taxableAmount)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-blue-600">{formatMoney(b.taxCollected)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{b.invoiceCount}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td className="px-4 py-2.5 font-semibold" colSpan={2}>Totals</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">{formatMoney(totalTaxable)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-blue-600">{formatMoney(totalCollected)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold">{totalInvoices}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {exemptAmount > 0 && (
            <div className="rounded-lg border px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Exempt (no tax rate assigned)</span>
              <span className="font-mono tabular-nums text-sm font-medium">{formatMoney(exemptAmount)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

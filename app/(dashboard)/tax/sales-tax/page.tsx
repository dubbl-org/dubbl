"use client";

import { useState, useEffect } from "react";
import { MapPin, Receipt, FileText, Printer, ArrowUpRight, FileBarChart, Tag, CheckCircle } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { ExportButton } from "@/components/dashboard/export-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import Link from "next/link";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate });
    fetch(`/api/v1/reports/sales-tax?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setBreakdown(data.breakdown || []);
        setExemptAmount(data.exemptAmount || 0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const totalTaxable = breakdown.reduce((sum, b) => sum + b.taxableAmount, 0);
  const totalCollected = breakdown.reduce((sum, b) => sum + b.taxCollected, 0);
  const totalInvoices = breakdown.reduce((sum, b) => sum + b.invoiceCount, 0);

  if (loading) return <BrandLoader />;

  if (breakdown.length === 0) {
    return (
      <ContentReveal>
        <div className="flex flex-col items-center gap-10 pt-16 pb-12">
          <div className="w-full max-w-xl">
            <div className="grid grid-cols-3 gap-0">
              {[
                { step: "1", label: "Set up rates", sub: "Create tax rates for your jurisdictions", color: "bg-blue-500", ring: "ring-blue-200 dark:ring-blue-900" },
                { step: "2", label: "Apply to invoices", sub: "Add tax rates to your sales invoices", color: "bg-amber-500", ring: "ring-amber-200 dark:ring-amber-900" },
                { step: "3", label: "Review", sub: "See tax collected broken down by rate", color: "bg-emerald-500", ring: "ring-emerald-200 dark:ring-emerald-900" },
              ].map(({ step, label, sub, color, ring }, i) => (
                <div key={step} className="flex flex-col items-center text-center relative">
                  {i < 2 && (
                    <div className="absolute top-4 left-[calc(50%+16px)] w-[calc(100%-32px)] h-px bg-border" />
                  )}
                  <div className={`relative z-10 flex size-8 items-center justify-center rounded-full ${color} ring-4 ${ring} text-white text-xs font-bold`}>
                    {step}
                  </div>
                  <p className="mt-3 text-sm font-medium">{label}</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-[150px] leading-relaxed">{sub}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-tight">No sales tax activity</h2>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-md">
              No taxable invoices found for this period. Create invoices with tax rates applied to see your sales tax breakdown here.
            </p>
            <div className="flex items-center justify-center gap-2 mt-5">
              <Button variant="outline" size="sm" className="h-9 text-xs" asChild>
                <Link href="/tax">Manage Tax Rates</Link>
              </Button>
              <Button size="sm" className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700" asChild>
                <Link href="/sales">Go to Sales</Link>
              </Button>
            </div>
          </div>

          <div className="w-full max-w-lg grid grid-cols-3 gap-3 opacity-40">
            {[
              { label: "Taxable Sales", value: "$0.00" },
              { label: "Tax Collected", value: "$0.00" },
              { label: "Exempt Sales", value: "$0.00" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-dashed p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-mono font-medium text-muted-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      <PageHeader
        title="Sales Tax Report"
        description="Tax collected by rate for the selected period."
      >
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Print
        </Button>
        <ExportButton
          data={breakdown.map((b) => ({
            taxRate: b.taxRateName || "Exempt",
            ratePercent: b.taxRatePercent != null ? (b.taxRatePercent / 100).toFixed(2) : "",
            taxableAmount: b.taxableAmount,
            taxCollected: b.taxCollected,
            invoiceCount: b.invoiceCount,
          }))}
          columns={["taxRate", "ratePercent", "taxableAmount", "taxCollected", "invoiceCount"]}
          filename="sales-tax"
        />
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" asChild>
          <Link href="/tax/periods">
            <ArrowUpRight className="size-3.5" />
            Tax Periods
          </Link>
        </Button>
      </PageHeader>

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Taxable Sales"
          value={formatMoney(totalTaxable)}
          icon={FileText}
          change={`${totalInvoices} invoice${totalInvoices !== 1 ? "s" : ""}`}
          changeType="neutral"
        />
        <StatCard
          title="Tax Collected"
          value={formatMoney(totalCollected)}
          icon={Receipt}
          changeType="neutral"
        />
        <StatCard
          title="Exempt Sales"
          value={formatMoney(exemptAmount)}
          icon={MapPin}
          changeType="neutral"
        />
      </div>

      <div className="space-y-3">
        {breakdown.map((b, i) => {
          const pct = totalCollected > 0 ? (b.taxCollected / totalCollected) * 100 : 0;
          return (
            <div key={i} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
                    <Receipt className="size-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{b.taxRateName || "No tax rate"}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.taxRatePercent != null ? `${(b.taxRatePercent / 100).toFixed(2)}%` : "N/A"}
                      {" · "}{b.invoiceCount} invoice{b.invoiceCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold font-mono tabular-nums text-blue-600 dark:text-blue-400">
                    {formatMoney(b.taxCollected)}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono tabular-nums">
                    on {formatMoney(b.taxableAmount)}
                  </p>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
              </div>
            </div>
          );
        })}

        <div className="flex justify-between items-center px-4 py-3 bg-muted/50 rounded-lg text-sm font-semibold">
          <span>Total Tax Collected</span>
          <span className="font-mono tabular-nums text-blue-600">{formatMoney(totalCollected)}</span>
        </div>
      </div>
    </ContentReveal>
  );
}

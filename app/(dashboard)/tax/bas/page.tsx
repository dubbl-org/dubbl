"use client";

import { useState, useEffect } from "react";
import { FileSpreadsheet, ArrowUpRight, ArrowDownLeft, Receipt, Printer, FileText, Send, CheckCircle } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { ExportButton } from "@/components/dashboard/export-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface BasField {
  field: string;
  label: string;
  amount: number;
}

const GST_FIELDS = ["G1", "G2", "G3", "G10", "G11", "1A", "1B"];
const KEY_FIELD = "NET";

function getFieldSection(field: string): string {
  if (GST_FIELDS.includes(field)) return "gst";
  if (field === "NET") return "net";
  return "other";
}

export default function BasPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [fields, setFields] = useState<BasField[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate });
    fetch(`/api/v1/reports/bas?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setFields(data.fields || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const gstOnSales = fields.find((f) => f.field === "1A")?.amount || 0;
  const gstOnPurchases = fields.find((f) => f.field === "1B")?.amount || 0;
  const netGst = fields.find((f) => f.field === "NET")?.amount || 0;

  const gstFields = fields.filter((f) => getFieldSection(f.field) === "gst");
  const netField = fields.find((f) => f.field === KEY_FIELD);
  const otherFields = fields.filter((f) => getFieldSection(f.field) === "other");

  if (loading) return <BrandLoader />;

  if (fields.length === 0) {
    return (
      <ContentReveal>
        <div className="flex flex-col items-center gap-10 pt-16 pb-12">
          <div className="w-full max-w-xl">
            <div className="grid grid-cols-3 gap-0">
              {[
                { step: "1", label: "Create", sub: "Add invoices and bills with GST tax rates applied", color: "bg-blue-500", ring: "ring-blue-200 dark:ring-blue-900" },
                { step: "2", label: "Record", sub: "Track your sales and purchase transactions", color: "bg-amber-500", ring: "ring-amber-200 dark:ring-amber-900" },
                { step: "3", label: "Calculate", sub: "BAS fields auto-populate from your GST data", color: "bg-emerald-500", ring: "ring-emerald-200 dark:ring-emerald-900" },
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
            <h2 className="text-lg font-semibold tracking-tight">No BAS data yet</h2>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-md">
              No GST activity found for this period. Create invoices and bills with GST tax rates to see your BAS calculations here.
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
              { label: "GST on Sales", value: "$0.00" },
              { label: "GST on Purchases", value: "$0.00" },
              { label: "Net GST", value: "$0.00" },
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
        title="Business Activity Statement"
        description="Australian BAS report with GST calculations."
      >
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Print
        </Button>
        <ExportButton
          data={fields.map((f) => ({ field: f.field, description: f.label, amount: f.amount }))}
          columns={["field", "description", "amount"]}
          filename="bas"
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
          title="GST on Sales (1A)"
          value={formatMoney(gstOnSales)}
          icon={ArrowUpRight}
          changeType="neutral"
        />
        <StatCard
          title="GST on Purchases (1B)"
          value={formatMoney(gstOnPurchases)}
          icon={ArrowDownLeft}
          changeType="neutral"
        />
        <StatCard
          title={netGst >= 0 ? "Net GST Payable" : "Net GST Refund"}
          value={formatMoney(Math.abs(netGst))}
          icon={Receipt}
          changeType={netGst >= 0 ? "negative" : "positive"}
        />
      </div>

      <div className="space-y-6">
        {gstFields.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">GST Information</h2>
              <Badge variant="outline" className="text-[10px]">G1-G11, 1A-1B</Badge>
            </div>
            <div className="rounded-lg border overflow-hidden">
              {gstFields.map((f, i) => {
                const isGstTotal = f.field === "1A" || f.field === "1B";
                return (
                  <div
                    key={f.field}
                    className={cn(
                      "flex items-center justify-between px-4 py-3.5",
                      i < gstFields.length - 1 && "border-b",
                      isGstTotal && "bg-muted/30"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex size-8 items-center justify-center rounded-md text-[10px] font-bold font-mono",
                        isGstTotal
                          ? "bg-blue-600 text-white dark:bg-blue-500"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {f.field}
                      </div>
                      <p className={cn("text-sm", isGstTotal && "font-medium")}>{f.label}</p>
                    </div>
                    <span className={cn(
                      "font-mono text-sm tabular-nums font-medium",
                      f.field === "1A" && "text-blue-600 dark:text-blue-400",
                      f.field === "1B" && "text-orange-600 dark:text-orange-400"
                    )}>
                      {formatMoney(f.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {otherFields.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Other Obligations</h2>
            <div className="rounded-lg border overflow-hidden">
              {otherFields.map((f, i) => (
                <div
                  key={f.field}
                  className={cn(
                    "flex items-center justify-between px-4 py-3.5",
                    i < otherFields.length - 1 && "border-b"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-md bg-muted text-[10px] font-bold font-mono text-muted-foreground">
                      {f.field}
                    </div>
                    <p className="text-sm">{f.label}</p>
                  </div>
                  <span className="font-mono text-sm tabular-nums font-medium">{formatMoney(f.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {netField && (
          <div className={cn(
            "rounded-lg border p-5",
            netField.amount >= 0
              ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
              : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{netField.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {netField.amount < 0 ? "Refund due from ATO" : "Amount payable to ATO"}
                </p>
              </div>
              <p className={cn(
                "text-xl font-bold font-mono tabular-nums",
                netField.amount >= 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
              )}>
                {formatMoney(Math.abs(netField.amount))}
              </p>
            </div>
          </div>
        )}
      </div>
    </ContentReveal>
  );
}

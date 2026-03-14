"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft, Clock, TrendingUp, TrendingDown } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ExportButton } from "@/components/dashboard/export-button";

interface PerformanceEntry {
  contactId: string;
  contactName: string;
  avgDays: number;
  avgTermDays: number;
  invoiceCount?: number;
  billCount?: number;
  totalCollected?: number;
  totalPaid?: number;
  lateCount: number;
  onTimeRate: number;
}

export default function PaymentPerformancePage() {
  const now = new Date();
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [receivables, setReceivables] = useState<PerformanceEntry[]>([]);
  const [payables, setPayables] = useState<PerformanceEntry[]>([]);
  const [avgCollect, setAvgCollect] = useState(0);
  const [avgPay, setAvgPay] = useState(0);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate });
    fetch(`/api/v1/reports/payment-performance?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setReceivables(data.receivables || []);
        setPayables(data.payables || []);
        setAvgCollect(data.avgDaysToCollect || 0);
        setAvgPay(data.avgDaysToPay || 0);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader title="Payment Performance" description="Average collection and payment times by contact.">
        <ExportButton
          data={[...receivables.map((r) => ({ ...r, type: "receivable" })), ...payables.map((p) => ({ ...p, type: "payable" }))]}
          columns={["type", "contactName", "avgDays", "avgTermDays", "lateCount", "onTimeRate"]}
          filename="payment-performance"
        />
      </PageHeader>

      <DateRangeFilter startDate={startDate} endDate={endDate} onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }} />

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard title="Avg Days to Collect" value={`${avgCollect}d`} icon={TrendingDown} changeType={avgCollect <= 30 ? "positive" : "negative"} />
            <StatCard title="Avg Days to Pay" value={`${avgPay}d`} icon={TrendingUp} changeType={avgPay <= 30 ? "positive" : "neutral"} />
          </div>

          {receivables.length > 0 && (
            <div className="mt-4">
              <PerformanceTable
                title="Collection Performance (Receivables)"
                entries={receivables}
                countLabel="Invoices"
                totalLabel="Collected"
                getCount={(e) => e.invoiceCount || 0}
                getTotal={(e) => e.totalCollected || 0}
              />
            </div>
          )}
          {payables.length > 0 && (
            <div className="mt-4">
              <PerformanceTable
                title="Payment Performance (Payables)"
                entries={payables}
                countLabel="Bills"
                totalLabel="Paid"
                getCount={(e) => e.billCount || 0}
                getTotal={(e) => e.totalPaid || 0}
              />
            </div>
          )}
          {receivables.length === 0 && payables.length === 0 && (
            <div className="rounded-xl border border-dashed py-12 text-center mt-4">
              <p className="text-sm text-muted-foreground">No payment data for this period. Pay or collect invoices/bills to see performance.</p>
            </div>
          )}
        </div>
      )}
    </ContentReveal>
  );
}

function PerformanceTable({
  title,
  entries,
  countLabel,
  totalLabel,
  getCount,
  getTotal,
}: {
  title: string;
  entries: PerformanceEntry[];
  countLabel: string;
  totalLabel: string;
  getCount: (e: PerformanceEntry) => number;
  getTotal: (e: PerformanceEntry) => number;
}) {
  return (
    <div>
      <p className="text-sm font-medium mb-3">{title}</p>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Contact</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Avg Days</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Terms</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{countLabel}</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{totalLabel}</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Late</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">On-Time</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const overTerms = e.avgDays > e.avgTermDays;
              return (
                <tr key={e.contactId} className="border-b last:border-b-0">
                  <td className="px-4 py-2.5 font-medium">{e.contactName}</td>
                  <td className={cn("px-4 py-2.5 text-right font-mono tabular-nums font-medium", overTerms ? "text-red-600" : "text-emerald-600")}>
                    {e.avgDays}d
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{e.avgTermDays}d</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{getCount(e)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatMoney(getTotal(e))}</td>
                  <td className="px-4 py-2.5 text-right text-red-600">{e.lateCount > 0 ? e.lateCount : "-"}</td>
                  <td className={cn("px-4 py-2.5 text-right font-mono tabular-nums", e.onTimeRate >= 80 ? "text-emerald-600" : "text-red-600")}>
                    {e.onTimeRate}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

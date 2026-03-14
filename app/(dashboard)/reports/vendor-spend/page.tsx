"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft, TrendingDown } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ExportButton } from "@/components/dashboard/export-button";

interface Vendor {
  contactId: string;
  contactName: string;
  totalSpend: number;
  billCount: number;
  avgBillAmount: number;
  lastBillDate: string;
  percentage: number;
}

const BAR_COLORS = [
  "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-yellow-500",
  "bg-lime-500", "bg-emerald-500", "bg-teal-500", "bg-cyan-500",
  "bg-blue-500", "bg-violet-500",
];

export default function VendorSpendPage() {
  const now = new Date();
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [totalSpend, setTotalSpend] = useState(0);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate });
    fetch(`/api/v1/reports/vendor-spend?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setVendors(data.vendors || []);
        setTotalSpend(data.totalSpend || 0);
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

      <PageHeader title="Vendor Spend Analysis" description="Top suppliers by total spend for the period.">
        <ExportButton
          data={vendors}
          columns={["contactName", "totalSpend", "billCount", "avgBillAmount", "lastBillDate", "percentage"]}
          filename="vendor-spend"
        />
      </PageHeader>

      <DateRangeFilter startDate={startDate} endDate={endDate} onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }} />

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <ContentReveal>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard title="Total Vendor Spend" value={formatMoney(totalSpend)} icon={TrendingDown} changeType="negative" />
            <StatCard title="Vendors" value={String(vendors.length)} icon={TrendingDown} changeType="neutral" change={`${vendors.length} active`} />
          </div>

          {vendors.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center mt-4">
              <p className="text-sm text-muted-foreground">No vendor spend data for this period.</p>
            </div>
          ) : (
            <>
              {/* Stacked bar */}
              <div className="h-3 rounded-full overflow-hidden flex mt-4">
                {vendors.slice(0, 10).map((v, i) => (
                  <div key={v.contactId} className={cn("h-full", BAR_COLORS[i % BAR_COLORS.length])} style={{ width: `${v.percentage}%` }} title={`${v.contactName}: ${v.percentage}%`} />
                ))}
              </div>

              <div className="rounded-lg border overflow-hidden mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Vendor</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Total Spend</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Bills</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Avg Bill</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Last Bill</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map((v, i) => (
                      <tr key={v.contactId} className="border-b last:border-b-0">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className={cn("size-2.5 rounded-full shrink-0", BAR_COLORS[i % BAR_COLORS.length])} />
                            <span className="font-medium">{v.contactName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-medium">{formatMoney(v.totalSpend)}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{v.billCount}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{formatMoney(v.avgBillAmount)}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{v.lastBillDate}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{v.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </ContentReveal>
      )}
    </ContentReveal>
  );
}

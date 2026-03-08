"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface ProfitabilityEntry {
  contactId: string;
  contactName: string;
  revenue: number;
  costs: number;
  profit: number;
  margin: number;
  invoiceCount: number;
  billCount: number;
}

export default function ProfitabilityPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [entries, setEntries] = useState<ProfitabilityEntry[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalCosts, setTotalCosts] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [overallMargin, setOverallMargin] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate, groupBy: "contact" });
    fetch(`/api/v1/reports/profitability?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setEntries(data.entries || []);
        setTotalRevenue(data.totalRevenue || 0);
        setTotalCosts(data.totalCosts || 0);
        setTotalProfit(data.totalProfit || 0);
        setOverallMargin(data.overallMargin || 0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contact Profitability"
        description="Revenue minus costs per customer for the selected period."
      />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Revenue"
          value={formatMoney(totalRevenue)}
          icon={TrendingUp}
          changeType="positive"
        />
        <StatCard
          title="Costs"
          value={formatMoney(totalCosts)}
          icon={TrendingDown}
          changeType="negative"
        />
        <StatCard
          title="Profit"
          value={formatMoney(totalProfit)}
          icon={DollarSign}
          changeType={totalProfit >= 0 ? "positive" : "negative"}
        />
        <StatCard
          title="Overall Margin"
          value={`${overallMargin}%`}
          icon={DollarSign}
          changeType={overallMargin > 0 ? "positive" : "negative"}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No profitability data. Create invoices and bills to see per-contact profitability.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Contact</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Revenue</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Costs</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Profit</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Margin</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Invoices</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Bills</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.contactId} className="border-b last:border-b-0">
                  <td className="px-4 py-2.5 font-medium">{e.contactName}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-600">{formatMoney(e.revenue)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-red-600">{formatMoney(e.costs)}</td>
                  <td className={cn(
                    "px-4 py-2.5 text-right font-mono tabular-nums font-medium",
                    e.profit >= 0 ? "text-emerald-600" : "text-red-600"
                  )}>
                    {formatMoney(e.profit)}
                  </td>
                  <td className={cn(
                    "px-4 py-2.5 text-right font-mono tabular-nums",
                    e.margin >= 0 ? "text-emerald-600" : "text-red-600"
                  )}>
                    {e.margin}%
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{e.invoiceCount}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{e.billCount}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30">
                <td className="px-4 py-2.5 font-semibold">Total</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-600">{formatMoney(totalRevenue)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-red-600">{formatMoney(totalCosts)}</td>
                <td className={cn(
                  "px-4 py-2.5 text-right font-mono tabular-nums font-semibold",
                  totalProfit >= 0 ? "text-emerald-600" : "text-red-600"
                )}>
                  {formatMoney(totalProfit)}
                </td>
                <td className={cn(
                  "px-4 py-2.5 text-right font-mono tabular-nums font-semibold",
                  overallMargin >= 0 ? "text-emerald-600" : "text-red-600"
                )}>
                  {overallMargin}%
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

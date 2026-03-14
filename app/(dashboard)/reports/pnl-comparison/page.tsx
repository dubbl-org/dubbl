"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft, ArrowUpDown } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface PeriodData {
  label: string;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  revenueChange: number;
  revenueChangePct: number;
  expensesChange: number;
  expensesChangePct: number;
  netIncomeChange: number;
  netIncomeChangePct: number;
}

export default function PnlComparisonPage() {
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [compareType, setCompareType] = useState("monthly");
  const [periodsCount, setPeriodsCount] = useState(6);
  const [periods, setPeriods] = useState<PeriodData[]>([]);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({
      compare: compareType,
      periods: String(periodsCount),
    });
    fetch(`/api/v1/reports/pnl-comparison?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setPeriods(data.periods || []);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, [compareType, periodsCount]);

  const chartData = periods.map((p) => ({
    name: p.label,
    revenue: p.totalRevenue / 100,
    expenses: p.totalExpenses / 100,
    netIncome: p.netIncome / 100,
  }));

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="P&L Comparison"
        description="Side-by-side period comparison with change amounts and percentages."
      />

      <div className="flex items-center gap-3">
        <select
          value={compareType}
          onChange={(e) => setCompareType(e.target.value)}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="yearly">Yearly</option>
        </select>
        <select
          value={periodsCount}
          onChange={(e) => setPeriodsCount(Number(e.target.value))}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          {[3, 4, 6, 8, 12].map((n) => (
            <option key={n} value={n}>{n} periods</option>
          ))}
        </select>
      </div>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : periods.length === 0 ? (
        <ContentReveal>
          <div className="rounded-xl border border-dashed py-12 text-center">
            <p className="text-sm text-muted-foreground">No data available for the selected periods.</p>
          </div>
        </ContentReveal>
      ) : (
        <ContentReveal>
          {/* Trend Chart */}
          <div className="space-y-6">
            <div className="rounded-lg border p-4">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expensesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(value) => [`$${Number(value).toFixed(2)}`]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" fill="url(#revenueGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" fill="url(#expensesGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Comparison Table */}
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground sticky left-0 bg-muted/30">Metric</th>
                    {periods.map((p) => (
                      <th key={p.label} className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground min-w-[120px]">
                        {p.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Revenue */}
                  <tr className="border-b">
                    <td className="px-4 py-2.5 font-medium sticky left-0 bg-background">Revenue</td>
                    {periods.map((p) => (
                      <td key={p.label} className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {formatMoney(p.totalRevenue)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b bg-muted/20">
                    <td className="px-4 py-1.5 text-xs text-muted-foreground sticky left-0 bg-muted/20">Change</td>
                    {periods.map((p, i) => (
                      <td key={p.label} className="px-4 py-1.5 text-right">
                        {i === 0 ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          <ChangeCell amount={p.revenueChange} pct={p.revenueChangePct} />
                        )}
                      </td>
                    ))}
                  </tr>
                  {/* Expenses */}
                  <tr className="border-b">
                    <td className="px-4 py-2.5 font-medium sticky left-0 bg-background">Expenses</td>
                    {periods.map((p) => (
                      <td key={p.label} className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {formatMoney(p.totalExpenses)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b bg-muted/20">
                    <td className="px-4 py-1.5 text-xs text-muted-foreground sticky left-0 bg-muted/20">Change</td>
                    {periods.map((p, i) => (
                      <td key={p.label} className="px-4 py-1.5 text-right">
                        {i === 0 ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          <ChangeCell amount={p.expensesChange} pct={p.expensesChangePct} inverted />
                        )}
                      </td>
                    ))}
                  </tr>
                  {/* Net Income */}
                  <tr className="border-t-2">
                    <td className="px-4 py-2.5 font-semibold sticky left-0 bg-background">Net Income</td>
                    {periods.map((p) => (
                      <td key={p.label} className={cn(
                        "px-4 py-2.5 text-right font-mono tabular-nums font-semibold",
                        p.netIncome >= 0 ? "text-emerald-600" : "text-red-600"
                      )}>
                        {formatMoney(p.netIncome)}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-muted/20">
                    <td className="px-4 py-1.5 text-xs text-muted-foreground sticky left-0 bg-muted/20">Change</td>
                    {periods.map((p, i) => (
                      <td key={p.label} className="px-4 py-1.5 text-right">
                        {i === 0 ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          <ChangeCell amount={p.netIncomeChange} pct={p.netIncomeChangePct} />
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}

function ChangeCell({ amount, pct, inverted }: { amount: number; pct: number; inverted?: boolean }) {
  const positive = inverted ? amount < 0 : amount > 0;
  const color = amount === 0 ? "text-muted-foreground" : positive ? "text-emerald-600" : "text-red-600";

  return (
    <div className={cn("text-xs font-mono tabular-nums", color)}>
      <span>{amount > 0 ? "+" : ""}{formatMoney(amount)}</span>
      <span className="ml-1 text-[10px]">({pct > 0 ? "+" : ""}{pct}%)</span>
    </div>
  );
}

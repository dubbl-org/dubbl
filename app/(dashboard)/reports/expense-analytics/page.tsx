"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft, PieChart, TrendingDown } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
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
} from "recharts";

interface Category {
  accountId: string;
  accountName: string;
  accountCode: string;
  total: number;
  transactions: number;
  percentage: number;
}

interface MonthlyPoint {
  month: string;
  total: number;
}

const CATEGORY_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-blue-500",
  "bg-violet-500",
];

export default function ExpenseAnalyticsPage() {
  const now = new Date();
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [categories, setCategories] = useState<Category[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyPoint[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [monthlyAverage, setMonthlyAverage] = useState(0);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate });
    fetch(`/api/v1/reports/expense-analytics?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setCategories(data.categories || []);
        setMonthlyTrend(data.monthlyTrend || []);
        setTotalExpenses(data.totalExpenses || 0);
        setMonthlyAverage(data.monthlyAverage || 0);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const chartData = monthlyTrend.map((m) => ({
    name: m.month,
    expenses: m.total / 100,
  }));

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="Expense Analytics"
        description="Spending breakdown by category with trends over time."
      />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              title="Total Expenses"
              value={formatMoney(totalExpenses)}
              icon={TrendingDown}
              changeType="negative"
            />
            <StatCard
              title="Monthly Average"
              value={formatMoney(monthlyAverage)}
              icon={PieChart}
              changeType="neutral"
            />
          </div>

          {/* Monthly Trend */}
          {chartData.length > 1 && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-3">Monthly Spending Trend</p>
              <div className="rounded-lg border p-4">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
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
                    <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" fill="url(#expGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Category Breakdown */}
          {categories.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-medium mb-3">By Category</p>

              {/* Stacked bar visualization */}
              <div className="h-3 rounded-full overflow-hidden flex mb-4">
                {categories.slice(0, 10).map((c, i) => (
                  <div
                    key={c.accountId}
                    className={cn("h-full", CATEGORY_COLORS[i % CATEGORY_COLORS.length])}
                    style={{ width: `${c.percentage}%` }}
                    title={`${c.accountName}: ${c.percentage}%`}
                  />
                ))}
              </div>

              <div className="space-y-2">
                {categories.map((c, i) => (
                  <div key={c.accountId} className="flex items-center justify-between rounded-lg border px-4 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("size-2.5 rounded-full shrink-0", CATEGORY_COLORS[i % CATEGORY_COLORS.length])} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.accountName}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.accountCode} · {c.transactions} transaction{c.transactions !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-sm font-mono font-semibold tabular-nums">{formatMoney(c.total)}</p>
                      <p className="text-xs text-muted-foreground font-mono tabular-nums">{c.percentage}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed py-12 text-center mt-4">
              <p className="text-sm text-muted-foreground">No expense data for this period.</p>
            </div>
          )}
        </div>
      )}
    </ContentReveal>
  );
}

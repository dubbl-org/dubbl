"use client";

import { useState, useEffect } from "react";
import { Gauge } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Ratios {
  currentRatio: number | null;
  quickRatio: number | null;
  debtToEquity: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  dso: number | null;
  dpo: number | null;
  returnOnAssets: number | null;
  returnOnEquity: number | null;
}

interface Balances {
  totalAssets: number;
  currentAssets: number;
  totalLiabilities: number;
  currentLiabilities: number;
  totalEquity: number;
  inventory: number;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  receivablesDue: number;
  payablesDue: number;
}

const ratioInfo: Record<string, { label: string; description: string; format: (v: number) => string; goodWhen: (v: number) => boolean }> = {
  currentRatio: {
    label: "Current Ratio",
    description: "Current assets / current liabilities. Measures short-term liquidity.",
    format: (v) => `${v}x`,
    goodWhen: (v) => v >= 1,
  },
  quickRatio: {
    label: "Quick Ratio",
    description: "Liquid assets (excl. inventory) / current liabilities.",
    format: (v) => `${v}x`,
    goodWhen: (v) => v >= 1,
  },
  debtToEquity: {
    label: "Debt to Equity",
    description: "Total liabilities / total equity. Lower is less leveraged.",
    format: (v) => `${v}x`,
    goodWhen: (v) => v <= 2,
  },
  grossMargin: {
    label: "Gross Margin",
    description: "Revenue minus cost of goods sold as a percentage of revenue.",
    format: (v) => `${v}%`,
    goodWhen: (v) => v > 0,
  },
  netMargin: {
    label: "Net Margin",
    description: "Net income as a percentage of revenue.",
    format: (v) => `${v}%`,
    goodWhen: (v) => v > 0,
  },
  dso: {
    label: "Days Sales Outstanding",
    description: "Average days to collect receivables.",
    format: (v) => `${v} days`,
    goodWhen: (v) => v <= 45,
  },
  dpo: {
    label: "Days Payable Outstanding",
    description: "Average days to pay suppliers.",
    format: (v) => `${v} days`,
    goodWhen: (v) => v <= 60,
  },
  returnOnAssets: {
    label: "Return on Assets",
    description: "Net income / total assets.",
    format: (v) => `${v}%`,
    goodWhen: (v) => v > 0,
  },
  returnOnEquity: {
    label: "Return on Equity",
    description: "Net income / total equity.",
    format: (v) => `${v}%`,
    goodWhen: (v) => v > 0,
  },
};

export default function FinancialRatiosPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [ratios, setRatios] = useState<Ratios | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate });
    fetch(`/api/v1/reports/financial-ratios?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRatios(data.ratios || null);
        setBalances(data.balances || null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Ratios & KPIs"
        description="Key financial metrics and performance indicators."
      />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : !ratios ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No financial data available.</p>
        </div>
      ) : (
        <>
          {/* Ratio Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(ratioInfo).map(([key, info]) => {
              const value = ratios[key as keyof Ratios];
              if (value === null) return null;
              const good = info.goodWhen(value);
              return (
                <div key={key} className="rounded-lg border p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{info.label}</p>
                    <Gauge className="size-3.5 text-muted-foreground/50" />
                  </div>
                  <p className={cn(
                    "text-2xl font-bold font-mono tabular-nums truncate",
                    good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  )}>
                    {info.format(value)}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{info.description}</p>
                </div>
              );
            })}
          </div>

          {/* Underlying Balances */}
          {balances && (
            <div>
              <p className="text-sm font-medium mb-3">Underlying Balances</p>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      ["Total Assets", balances.totalAssets],
                      ["Current Assets", balances.currentAssets],
                      ["Inventory", balances.inventory],
                      ["Total Liabilities", balances.totalLiabilities],
                      ["Current Liabilities", balances.currentLiabilities],
                      ["Total Equity", balances.totalEquity],
                      ["Revenue (Period)", balances.totalRevenue],
                      ["Expenses (Period)", balances.totalExpenses],
                      ["Net Income (Period)", balances.netIncome],
                      ["Receivables Due", balances.receivablesDue],
                      ["Payables Due", balances.payablesDue],
                    ].map(([label, value]) => (
                      <tr key={label as string} className="border-b last:border-b-0">
                        <td className="px-4 py-2 text-muted-foreground">{label as string}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums font-medium">
                          {formatMoney(value as number)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

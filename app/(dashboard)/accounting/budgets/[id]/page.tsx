"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useBudgetContext } from "./layout";
import type { BudgetLineData, PeriodComparison } from "./layout";
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

export default function BudgetOverviewPage() {
  const { budget, comparisons } = useBudgetContext();

  const grandTotal = budget.lines.reduce((s, l) => s + l.total, 0);

  // Build chart data from period comparisons (aggregate across all accounts)
  const chartData = useMemo(() => {
    if (comparisons.length === 0) return [];

    // Collect all unique periods across all comparisons
    const periodMap = new Map<string, { label: string; sortOrder: number; budgeted: number; actual: number }>();

    for (const c of comparisons) {
      for (const p of c.periods || []) {
        const existing = periodMap.get(p.label);
        if (existing) {
          existing.budgeted += p.budgeted;
          existing.actual += p.actual;
        } else {
          periodMap.set(p.label, {
            label: p.label,
            sortOrder: p.sortOrder,
            budgeted: p.budgeted,
            actual: p.actual,
          });
        }
      }
    }

    return Array.from(periodMap.values())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({
        name: p.label,
        budgeted: p.budgeted / 100,
        actual: p.actual / 100,
      }));
  }, [comparisons]);

  return (
    <div className="space-y-6">
      {/* Spending trend chart */}
      {chartData.length > 1 && (
        <div>
          <p className="text-sm font-medium mb-3">Spending Trend</p>
          <div className="rounded-lg border p-4">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="budgetedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
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
                <Area type="monotone" dataKey="budgeted" name="Budgeted" stroke="#8b5cf6" fill="url(#budgetedGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="actual" name="Actual" stroke="#3b82f6" fill="url(#actualGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per-account breakdown */}
      {comparisons.length > 0 ? (
        <div className="space-y-3">
          {comparisons.map((c) => {
            const pct = c.budgeted === 0 ? 0 : Math.round((c.actual / c.budgeted) * 100);
            const over = c.actual > c.budgeted;
            const budgetLine = budget.lines.find((l) => l.accountId === c.accountId);
            return (
              <ViewLineCard
                key={c.accountId}
                accountName={c.accountName}
                accountCode={c.accountCode}
                budgeted={c.budgeted}
                actual={c.actual}
                variance={c.variance}
                pct={pct}
                over={over}
                burnRate={c.burnRate}
                budgetLine={budgetLine}
                periodComparisons={c.periods}
              />
            );
          })}
        </div>
      ) : budget.lines.length > 0 ? (
        <div className="space-y-3">
          {budget.lines.map((line) => (
            <ViewLineCard
              key={line.id}
              accountName={line.account?.name || line.accountId}
              accountCode={line.account?.code || ""}
              budgeted={line.total}
              actual={0}
              variance={line.total}
              pct={0}
              over={false}
              burnRate={0}
              budgetLine={line}
              periodComparisons={[]}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No budget lines configured.</p>
          <Button size="sm" variant="outline" className="mt-3" asChild>
            <a href={`/accounting/budgets/${budget.id}/settings`}>Add lines</a>
          </Button>
        </div>
      )}

      {/* Period breakdown table */}
      {comparisons.length > 0 && comparisons[0]?.periods?.length > 0 && (
        <>
          <div className="h-px bg-border" />
          <PeriodBreakdownTable comparisons={comparisons} />
        </>
      )}

      {/* Grand total */}
      {grandTotal > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium">Grand Total</p>
          <p className="font-mono text-lg font-semibold tabular-nums">{formatMoney(grandTotal)}</p>
        </div>
      )}
    </div>
  );
}

function ViewLineCard({
  accountName,
  accountCode,
  budgeted,
  actual,
  variance,
  pct,
  over,
  burnRate,
  budgetLine,
  periodComparisons,
}: {
  accountName: string;
  accountCode: string;
  budgeted: number;
  actual: number;
  variance: number;
  pct: number;
  over: boolean;
  burnRate: number;
  budgetLine?: BudgetLineData;
  periodComparisons: PeriodComparison[];
}) {
  const [expanded, setExpanded] = useState(false);

  const periods = periodComparisons.length > 0
    ? periodComparisons
    : (budgetLine?.periods || []).map((p) => ({
        id: p.id,
        label: p.label,
        startDate: p.startDate,
        endDate: p.endDate,
        budgeted: p.amount,
        actual: 0,
        variance: p.amount,
        sortOrder: p.sortOrder,
      }));

  return (
    <div className="rounded-lg border px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{accountName}</p>
            {accountCode && <span className="text-xs text-muted-foreground font-mono">{accountCode}</span>}
          </div>
        </div>
        <div className="text-right shrink-0 ml-4">
          <p className="text-sm font-mono font-semibold tabular-nums">
            {actual > 0 ? (
              <>{formatMoney(actual)} <span className="text-muted-foreground font-normal">/ {formatMoney(budgeted)}</span></>
            ) : (
              formatMoney(budgeted)
            )}
          </p>
          {actual > 0 && (
            <p className={cn(
              "text-xs font-mono tabular-nums",
              over ? "text-red-600" : "text-emerald-600"
            )}>
              {over ? "Over by " : "Under by "}{formatMoney(Math.abs(variance))}
            </p>
          )}
        </div>
      </div>
      {actual > 0 && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"
            )}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          {actual > 0 && <span>{pct}% utilized</span>}
          {actual > 0 && <span className="font-mono tabular-nums">{formatMoney(budgeted - actual)} remaining</span>}
          {burnRate > 0 && <span className="font-mono tabular-nums">Projected: {formatMoney(burnRate)}</span>}
          {actual === 0 && <span>No spending recorded yet</span>}
        </div>
        {periods.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            Periods
          </button>
        )}
      </div>
      {expanded && periods.length > 0 && (
        <div className="space-y-1 pt-1">
          {periods.sort((a, b) => a.sortOrder - b.sortOrder).map((p) => {
            const pPct = p.budgeted === 0 ? 0 : Math.round((p.actual / p.budgeted) * 100);
            const pOver = p.actual > p.budgeted;
            return (
              <div key={p.id} className="flex items-center justify-between text-[11px] py-1 px-2 rounded hover:bg-muted/50">
                <span className="text-muted-foreground min-w-[80px]">{p.label}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono tabular-nums">{formatMoney(p.budgeted)}</span>
                  {p.actual > 0 && (
                    <>
                      <span className="font-mono tabular-nums text-blue-600">{formatMoney(p.actual)}</span>
                      <span className={cn(
                        "font-mono tabular-nums",
                        pOver ? "text-red-600" : "text-emerald-600"
                      )}>
                        {pOver ? "+" : "-"}{formatMoney(Math.abs(p.variance))}
                      </span>
                      <span className="text-muted-foreground w-8 text-right">{pPct}%</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PeriodBreakdownTable({ comparisons }: { comparisons: { periods: PeriodComparison[] }[] }) {
  // Aggregate periods across all accounts
  const periodMap = new Map<string, { label: string; sortOrder: number; budgeted: number; actual: number }>();

  for (const c of comparisons) {
    for (const p of c.periods || []) {
      const existing = periodMap.get(p.label);
      if (existing) {
        existing.budgeted += p.budgeted;
        existing.actual += p.actual;
      } else {
        periodMap.set(p.label, {
          label: p.label,
          sortOrder: p.sortOrder,
          budgeted: p.budgeted,
          actual: p.actual,
        });
      }
    }
  }

  const periods = Array.from(periodMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  if (periods.length === 0) return null;

  return (
    <div>
      <p className="text-sm font-medium mb-3">Period Breakdown</p>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Period</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Budgeted</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Actual</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Variance</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => {
              const variance = p.budgeted - p.actual;
              return (
                <tr key={p.label} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-sm">{p.label}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-sm">{formatMoney(p.budgeted)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-sm text-blue-600">{formatMoney(p.actual)}</td>
                  <td className={cn(
                    "px-4 py-2 text-right font-mono tabular-nums text-sm",
                    variance >= 0 ? "text-emerald-600" : "text-red-600"
                  )}>
                    {variance >= 0 ? "" : "-"}{formatMoney(Math.abs(variance))}
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

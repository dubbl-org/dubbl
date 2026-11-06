"use client";

import { createContext, useContext, useCallback, useMemo } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { ArrowLeft, Target, TrendingUp, TrendingDown, BarChart3, Settings2, Flame, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { cn } from "@/lib/utils";
import type { PeriodType } from "@/lib/budget-periods";
import { useApi, useApiCache } from "@/lib/query/use-api";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface BudgetPeriodData {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  amount: number;
  sortOrder: number;
}

interface BudgetLineData {
  id: string;
  accountId: string;
  account: Account | null;
  total: number;
  periods: BudgetPeriodData[];
}

interface BudgetData {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  periodType: PeriodType;
  isActive: boolean;
  // Spending alert at this % of a period's budget; null = off
  varianceThresholdPct: number | null;
  createdAt: string;
  lines: BudgetLineData[];
}

interface PeriodComparison {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  budgeted: number;
  actual: number;
  variance: number;
  sortOrder: number;
}

interface Comparison {
  accountId: string;
  accountName: string;
  accountCode: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePct: number;
  burnRate: number;
  projected: number;
  periods: PeriodComparison[];
}

interface BudgetContextValue {
  budget: BudgetData;
  setBudget: (fn: (prev: BudgetData | null) => BudgetData | null) => void;
  comparisons: Comparison[];
  totalBudgeted: number;
  totalActual: number;
  totalBurnRate: number;
  daysElapsed: number;
  daysRemaining: number;
  totalDays: number;
  accounts: Account[];
  refetch: () => void;
}

const BudgetContext = createContext<BudgetContextValue | null>(null);

export function useBudgetContext() {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error("useBudgetContext must be used within budget layout");
  return ctx;
}

export type { BudgetData, BudgetLineData, BudgetPeriodData, Comparison, PeriodComparison, Account };

const PERIOD_TYPE_LABELS: Record<PeriodType, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  daily: "Daily",
  quarterly: "Quarterly",
  yearly: "Yearly",
  custom: "Custom",
};

const PAGE_TABS = [
  { value: "overview", label: "Overview", icon: BarChart3, href: (id: string) => `/accounting/budgets/${id}` },
  { value: "settings", label: "Settings", icon: Settings2, href: (id: string) => `/accounting/budgets/${id}/settings` },
] as const;

export default function BudgetDetailLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const budgetUrl = `/api/v1/budgets/${id}`;
  const budgetQuery = useApi<{ budget?: BudgetData | null }>(budgetUrl);
  const accountsQuery = useApi<{ accounts?: Account[] }>("/api/v1/accounts?limit=500");
  const reportQuery = useApi<{
    comparisons?: Comparison[];
    totalBudgeted?: number;
    totalActual?: number;
    totalBurnRate?: number;
    daysElapsed?: number;
    daysRemaining?: number;
    totalDays?: number;
  }>(`/api/v1/reports/budget-vs-actual?budgetId=${id}`);
  const cache = useApiCache();
  const budget = budgetQuery.data?.budget ?? null;
  const report = reportQuery.data;
  const comparisons = useMemo(() => report?.comparisons || [], [report]);
  const totalBudgeted = report?.totalBudgeted || 0;
  const totalActual = report?.totalActual || 0;
  const totalBurnRate = report?.totalBurnRate || 0;
  const daysElapsed = report?.daysElapsed || 0;
  const daysRemaining = report?.daysRemaining || 0;
  const totalDays = report?.totalDays || 0;
  const accounts = useMemo(() => accountsQuery.data?.accounts || [], [accountsQuery.data]);
  const loading = budgetQuery.loading || accountsQuery.loading || reportQuery.loading;
  const refetchBudget = budgetQuery.refetch;
  const refetchAccounts = accountsQuery.refetch;
  const refetchReport = reportQuery.refetch;

  useEntityTitle(budget?.name ?? undefined);

  const setBudget = useCallback(
    (fn: (prev: BudgetData | null) => BudgetData | null) =>
      cache.update<{ budget?: BudgetData | null }>(budgetUrl, (d) => ({ ...d, budget: fn(d.budget ?? null) })),
    [cache, budgetUrl]
  );

  const fetchData = useCallback(() => {
    void refetchBudget();
    void refetchAccounts();
    void refetchReport();
  }, [refetchBudget, refetchAccounts, refetchReport]);

  if (loading) return <BrandLoader />;

  if (!budget) {
    return (
      <div className="space-y-4 pt-12 text-center">
        <p className="text-sm text-muted-foreground">Budget not found</p>
        <button onClick={() => router.push("/accounting/budgets")} className="text-sm text-muted-foreground underline">Back to Budgets</button>
      </div>
    );
  }

  const grandTotal = budget.lines.reduce((s, l) => s + l.total, 0);
  const totalVariance = totalBudgeted - totalActual;
  const overallPct = totalBudgeted > 0 ? Math.round((totalActual / totalBudgeted) * 100) : 0;
  const activeTab = pathname.endsWith("/settings") ? "settings" : "overview";

  return (
    <BudgetContext.Provider value={{ budget, setBudget, comparisons, totalBudgeted, totalActual, totalBurnRate, daysElapsed, daysRemaining, totalDays, accounts, refetch: fetchData }}>
      <ContentReveal>
        {/* Back link */}
        <button
          onClick={() => router.push("/accounting/budgets")}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="size-3.5" />
          Back to budgets
        </button>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 dark:bg-purple-500/15">
              <Target className="size-5 text-purple-700 dark:text-purple-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                <h1 className="text-base sm:text-lg font-semibold tracking-tight">{budget.name}</h1>
                <Badge variant="outline" className={budget.isActive
                  ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300"
                  : "text-muted-foreground"
                }>
                  {budget.isActive ? "Active" : "Inactive"}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {PERIOD_TYPE_LABELS[budget.periodType]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {budget.startDate} · {budget.endDate} · {budget.lines.length} line{budget.lines.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-8">
          <div>
            <p className="text-[11px] text-muted-foreground">Total Budget</p>
            <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums">{formatMoney(grandTotal)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <TrendingUp className="size-3 text-blue-500" />
              Actual Spend
            </p>
            <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-blue-600">
              {totalActual > 0 ? formatMoney(totalActual) : "-"}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              {totalVariance >= 0
                ? <TrendingDown className="size-3 text-brand-500" />
                : <TrendingUp className="size-3 text-red-500" />
              }
              Variance
            </p>
            <p className={cn(
              "mt-0.5 font-mono text-lg font-semibold tabular-nums",
              totalVariance >= 0 ? "text-brand-600" : "text-red-600"
            )}>
              {totalBudgeted > 0 ? formatMoney(Math.abs(totalVariance)) : "-"}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Flame className="size-3 text-orange-500" />
              Burn Rate
            </p>
            <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-orange-600">
              {totalBurnRate > 0 ? formatMoney(totalBurnRate) : "-"}
            </p>
            {totalBurnRate > 0 && (
              <p className="text-[10px] text-muted-foreground">projected total</p>
            )}
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="size-3 text-violet-500" />
              Days Remaining
            </p>
            <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
              {daysRemaining}
            </p>
            <p className="text-[10px] text-muted-foreground">{daysElapsed} of {totalDays} elapsed</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Utilization</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="h-2 flex-1 rounded-full bg-gray-200 dark:bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    overallPct > 100 ? "bg-red-500" : overallPct > 80 ? "bg-amber-500" : "bg-brand-500"
                  )}
                  style={{ width: `${Math.min(overallPct, 100)}%` }}
                />
              </div>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">{overallPct}%</span>
            </div>
          </div>
        </div>

        {/* Page tabs */}
        <nav className="-mt-2 mb-8 flex items-center gap-1 overflow-x-auto border-b border-border">
          {PAGE_TABS.map((t) => {
            const Icon = t.icon;
            const tabHref = t.href(id);
            const active = activeTab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => router.push(tabHref)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2.5 text-[13px] font-medium transition-colors",
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <ContentReveal key={pathname}>
          {children}
        </ContentReveal>
      </ContentReveal>
    </BudgetContext.Provider>
  );
}

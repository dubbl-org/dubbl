"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { ArrowLeft, Target, TrendingUp, TrendingDown, BarChart3, Settings2, Flame, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { cn } from "@/lib/utils";
import type { PeriodType } from "@/lib/budget-periods";

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
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [totalBudgeted, setTotalBudgeted] = useState(0);
  const [totalActual, setTotalActual] = useState(0);
  const [totalBurnRate, setTotalBurnRate] = useState(0);
  const [daysElapsed, setDaysElapsed] = useState(0);
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [totalDays, setTotalDays] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEntityTitle(budget?.name ?? undefined);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchData = useCallback(() => {
    if (!orgId) return;
    setLoading(true);

    Promise.all([
      fetch(`/api/v1/budgets/${id}`, { headers: { "x-organization-id": orgId } }).then((r) => r.json()),
      fetch("/api/v1/accounts?limit=500", { headers: { "x-organization-id": orgId } }).then((r) => r.json()),
      fetch(`/api/v1/reports/budget-vs-actual?budgetId=${id}`, { headers: { "x-organization-id": orgId } }).then((r) => r.json()).catch(() => null),
    ])
      .then(([budgetData, accountsData, reportData]) => {
        if (budgetData.budget) setBudget(budgetData.budget);
        setAccounts(accountsData.accounts || []);
        if (reportData) {
          setComparisons(reportData.comparisons || []);
          setTotalBudgeted(reportData.totalBudgeted || 0);
          setTotalActual(reportData.totalActual || 0);
          setTotalBurnRate(reportData.totalBurnRate || 0);
          setDaysElapsed(reportData.daysElapsed || 0);
          setDaysRemaining(reportData.daysRemaining || 0);
          setTotalDays(reportData.totalDays || 0);
        }
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

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
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
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
                ? <TrendingDown className="size-3 text-emerald-500" />
                : <TrendingUp className="size-3 text-red-500" />
              }
              Variance
            </p>
            <p className={cn(
              "mt-0.5 font-mono text-lg font-semibold tabular-nums",
              totalVariance >= 0 ? "text-emerald-600" : "text-red-600"
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
                    overallPct > 100 ? "bg-red-500" : overallPct > 80 ? "bg-amber-500" : "bg-emerald-500"
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

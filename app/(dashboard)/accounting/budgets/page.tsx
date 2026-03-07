"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Target } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { cn } from "@/lib/utils";

interface Budget {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  periodType: string;
  isActive: boolean;
  createdAt: string;
  lines?: { total: number }[];
}

interface BudgetUtilization {
  budgetId: string;
  name: string;
  totalBudgeted: number;
  totalActual: number;
}

export default function BudgetsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [utilization, setUtilization] = useState<BudgetUtilization[]>([]);

  const fetchData = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setLoading(true);
    fetch("/api/v1/budgets?limit=100", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then(async (data) => {
        if (data.data) {
          setBudgets(data.data);
          const active = (data.data as Budget[]).filter((b) => b.isActive).slice(0, 5);
          const results = await Promise.all(
            active.map((b) =>
              fetch(`/api/v1/reports/budget-vs-actual?budgetId=${b.id}`, {
                headers: { "x-organization-id": orgId },
              })
                .then((r) => r.json())
                .then((d) => ({
                  budgetId: b.id,
                  name: b.name,
                  totalBudgeted: d.totalBudgeted as number,
                  totalActual: d.totalActual as number,
                }))
                .catch(() => null)
            )
          );
          setUtilization(results.filter((r): r is BudgetUtilization => r !== null));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    window.addEventListener("budgets-changed", fetchData);
    return () => window.removeEventListener("budgets-changed", fetchData);
  }, [fetchData]);

  if (loading) return <BrandLoader />;

  if (budgets.length === 0) {
    return (
      <ContentReveal className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Budgets</h2>
          <Button
            onClick={() => openDrawer("budget")}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New Budget
          </Button>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b">
            <Target className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Budget Tracking</p>
              <p className="text-xs text-muted-foreground">Monitor spending against your targets</p>
            </div>
          </div>
          <div className="p-5 space-y-5 opacity-40">
            {[
              { label: "Marketing", pct: 65 },
              { label: "Operations", pct: 82 },
              { label: "Engineering", pct: 40 },
              { label: "Sales", pct: 55 },
            ].map(({ label, pct }) => (
              <div key={label} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">{label}</span>
                  <span className={cn("text-xs font-medium", pct > 80 ? "text-amber-500/70" : "text-emerald-500/70")}>{pct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", pct > 80 ? "bg-amber-500/50" : "bg-emerald-500/50")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </ContentReveal>
    );
  }

  const activeBudgets = budgets.filter((b) => b.isActive);

  return (
    <ContentReveal className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Budgets</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {budgets.length} budget{budgets.length !== 1 ? "s" : ""} · {activeBudgets.length} active
          </p>
        </div>
        <Button
          onClick={() => openDrawer("budget")}
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="mr-2 size-4" />
          New Budget
        </Button>
      </div>

      {/* Active budget utilization cards */}
      {utilization.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {utilization.map((u) => {
            const pct = u.totalBudgeted === 0 ? 0 : Math.round((u.totalActual / u.totalBudgeted) * 100);
            const over = u.totalActual > u.totalBudgeted;
            return (
              <button
                key={u.budgetId}
                onClick={() => router.push(`/accounting/budgets/${u.budgetId}`)}
                className="rounded-lg border bg-card p-4 text-left hover:bg-muted/50 transition-colors space-y-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <span className={cn(
                    "text-xs font-mono tabular-nums font-medium",
                    over ? "text-red-600" : pct > 80 ? "text-amber-600" : "text-emerald-600"
                  )}>{pct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"
                    )}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground font-mono tabular-nums">
                  <span>{formatMoney(u.totalActual)}</span>
                  <span>/ {formatMoney(u.totalBudgeted)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* All budgets list */}
      <div className="rounded-lg border overflow-hidden">
        <div className="divide-y">
          {budgets.map((b) => {
            const total = b.lines?.reduce((s, l) => s + l.total, 0) || 0;
            return (
              <button
                key={b.id}
                onClick={() => router.push(`/accounting/budgets/${b.id}`)}
                className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-muted/50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{b.name}</p>
                    <Badge variant="outline" className={cn(
                      "text-[10px] shrink-0",
                      b.isActive
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : ""
                    )}>
                      {b.isActive ? "Active" : "Inactive"}
                    </Badge>
                    {b.periodType && b.periodType !== "monthly" && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {b.periodType.charAt(0).toUpperCase() + b.periodType.slice(1)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {b.startDate} · {b.endDate}
                  </p>
                </div>
                <span className="font-mono text-sm font-medium tabular-nums shrink-0">
                  {formatMoney(total)}
                </span>
                <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </ContentReveal>
  );
}

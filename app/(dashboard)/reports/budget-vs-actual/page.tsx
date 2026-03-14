"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft, DollarSign, Target } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { BudgetProgressBar } from "@/components/dashboard/budget-progress-bar";
import { EmptyState } from "@/components/dashboard/empty-state";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";

interface Budget {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface Comparison {
  accountId: string;
  accountName: string;
  accountCode: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePct: number;
}

const columns: Column<Comparison>[] = [
  { key: "code", header: "Code", className: "w-24", render: (r) => <span className="font-mono text-sm">{r.accountCode}</span> },
  { key: "name", header: "Account", render: (r) => <span className="text-sm font-medium">{r.accountName}</span> },
  { key: "budgeted", header: "Budgeted", className: "w-28 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{formatMoney(r.budgeted)}</span> },
  { key: "actual", header: "Actual", className: "w-28 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{formatMoney(r.actual)}</span> },
  { key: "variance", header: "Variance", className: "w-28 text-right", render: (r) => (
    <span className={`font-mono text-sm tabular-nums ${r.variance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
      {formatMoney(r.variance)}
    </span>
  )},
  { key: "pct", header: "%", className: "w-20 text-right", render: (r) => (
    <span className={`text-sm tabular-nums ${r.variance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
      {r.variancePct}%
    </span>
  )},
];

export default function BudgetVsActualPage() {
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>("");
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [totalBudgeted, setTotalBudgeted] = useState(0);
  const [totalActual, setTotalActual] = useState(0);
  const [totalVariance, setTotalVariance] = useState(0);
  const [reportLoading, setReportLoading] = useState(false);

  // Fetch budget list
  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    fetch("/api/v1/budgets?limit=100", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list = data.data || [];
        setBudgets(list);
        if (list.length > 0) {
          setSelectedBudgetId(list[0].id);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Fetch report when budget selected
  useEffect(() => {
    if (!selectedBudgetId) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReportLoading(true);
    fetch(`/api/v1/reports/budget-vs-actual?budgetId=${selectedBudgetId}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setComparisons(data.comparisons || []);
        setTotalBudgeted(data.totalBudgeted || 0);
        setTotalActual(data.totalActual || 0);
        setTotalVariance(data.totalVariance || 0);
      })
      .finally(() => { if (!cancelled) setReportLoading(false); });
    return () => { cancelled = true; };
  }, [selectedBudgetId]);

  if (initialLoad) return <BrandLoader />;

  if (budgets.length === 0) {
    return (
      <ContentReveal className="space-y-6">
        <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-3.5" /> Back to reports
        </Link>
        <PageHeader title="Budget vs Actual" description="Compare budgeted amounts to actual GL balances." />
        <EmptyState
          icon={Target}
          title="No budgets yet"
          description="Create a budget first to see budget vs actual comparisons."
        />
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="Budget vs Actual"
        description="Compare budgeted amounts to actual GL balances."
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-sm font-medium">Budget:</label>
        <select
          className="h-9 w-full sm:w-auto rounded-md border bg-background px-3 text-sm"
          value={selectedBudgetId}
          onChange={(e) => setSelectedBudgetId(e.target.value)}
        >
          {budgets.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Total Budgeted" value={formatMoney(totalBudgeted)} icon={Target} />
        <StatCard title="Total Actual" value={formatMoney(totalActual)} icon={DollarSign} />
        <StatCard
          title="Variance"
          value={formatMoney(totalVariance)}
          icon={DollarSign}
          changeType={totalVariance >= 0 ? "positive" : "negative"}
        />
      </div>

      {reportLoading ? (
        <BrandLoader className="h-48" />
      ) : (
        <ContentReveal>
          {comparisons.length > 0 && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6">
              {comparisons.slice(0, 6).map((c) => (
                <div key={c.accountId} className="rounded-lg border bg-card p-4">
                  <BudgetProgressBar
                    budgeted={c.budgeted}
                    actual={c.actual}
                    label={c.accountName}
                  />
                </div>
              ))}
            </div>
          )}

          <DataTable
            columns={columns}
            data={comparisons}
            loading={loading || reportLoading}
            emptyMessage="No budget lines to compare."
          />

          <div className="flex justify-between px-3 py-2 sm:px-4 sm:py-3 bg-muted/50 rounded-lg text-sm font-semibold mt-6">
            <span>Total Variance</span>
            <span className={`font-mono tabular-nums ${totalVariance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatMoney(totalVariance)}
            </span>
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}

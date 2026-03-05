"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Target } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";

import { StatCard } from "@/components/dashboard/stat-card";
import { BudgetProgressBar } from "@/components/dashboard/budget-progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { BlurReveal } from "@/components/ui/blur-reveal";

interface Budget {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
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

const columns: Column<Budget>[] = [
  { key: "name", header: "Name", render: (r) => <span className="text-sm font-medium">{r.name}</span> },
  { key: "start", header: "Start", className: "w-28", render: (r) => <span className="text-sm">{r.startDate}</span> },
  { key: "end", header: "End", className: "w-28", render: (r) => <span className="text-sm">{r.endDate}</span> },
  { key: "status", header: "Status", className: "w-24", render: (r) => (
    <Badge variant="outline" className={r.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>
      {r.isActive ? "Active" : "Inactive"}
    </Badge>
  )},
  { key: "total", header: "Total Budget", className: "w-32 text-right", render: (r) => {
    const total = r.lines?.reduce((s, l) => s + l.total, 0) || 0;
    return <span className="font-mono text-sm tabular-nums">{formatMoney(total)}</span>;
  }},
];

export default function BudgetsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [utilization, setUtilization] = useState<BudgetUtilization[]>([]);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
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

  const activeBudgets = budgets.filter((b) => b.isActive).length;

  if (!loading && budgets.length === 0) {
    return (
      <BlurReveal className="space-y-10">
        <Section title="Budgets" description="Plan and track your financial budgets.">
          <div className="space-y-6 min-h-[50vh] flex flex-col justify-center">
            <div className="rounded-lg border border-dashed bg-card p-6 space-y-4 opacity-60">
              <p className="text-xs font-medium text-muted-foreground">Preview: Budget Utilization</p>
              {[
                { label: "Marketing", pct: 65 },
                { label: "Operations", pct: 82 },
                { label: "Engineering", pct: 40 },
              ].map(({ label, pct }) => (
                <div key={label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-muted-foreground">{label}</span>
                    <span className="tabular-nums font-mono text-xs text-muted-foreground">{pct}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct > 80 ? "bg-amber-500/50" : "bg-emerald-500/50"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center py-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
                <Target className="size-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="mt-4 text-sm font-medium">Track spending against targets</h3>
              <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                Create your first budget to monitor how actuals compare to your plan.
              </p>
              <div className="mt-4">
                <Button
                  onClick={() => openDrawer("budget")}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus className="mr-2 size-4" />
                  New Budget
                </Button>
              </div>
            </div>
          </div>
        </Section>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal className="space-y-10">
      <Section title="Overview" description="A summary of your budgets and their current status.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard title="Total Budgets" value={budgets.length.toString()} icon={Target} />
            <StatCard title="Active" value={activeBudgets.toString()} icon={Target} />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => openDrawer("budget")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Budget
            </Button>
          </div>
        </div>
      </Section>

      {utilization.length > 0 && (
        <>
          <div className="h-px bg-border" />

          <Section title="Budget Utilization" description="Spending progress against active budgets.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {utilization.map((u) => (
                <div key={u.budgetId} className="rounded-lg border bg-card p-4">
                  <BudgetProgressBar
                    label={u.name}
                    budgeted={u.totalBudgeted}
                    actual={u.totalActual}
                  />
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      <div className="h-px bg-border" />

      <Section title="Budgets" description="View and manage all your financial budgets.">
        <DataTable
          columns={columns}
          data={budgets}
          loading={loading}
          emptyMessage="No budgets found."
          onRowClick={(r) => router.push(`/accounting/budgets/${r.id}`)}
        />
      </Section>
    </BlurReveal>
  );
}

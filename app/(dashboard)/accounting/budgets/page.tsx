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
      <BlurReveal>
        <div className="min-h-[60vh] flex flex-col justify-center gap-8">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-3">
                <Target className="size-4 text-muted-foreground" />
                <div>
                  <h2 className="text-sm font-semibold">Budget Tracking</h2>
                  <p className="text-xs text-muted-foreground">Monitor spending against your targets</p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => openDrawer("budget")}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="mr-2 size-4" />
                New Budget
              </Button>
            </div>
            <div className="p-5 space-y-5 opacity-40">
              {[
                { label: "Marketing", budgeted: "$12,000", actual: "$7,800", pct: 65 },
                { label: "Operations", budgeted: "$25,000", actual: "$20,500", pct: 82 },
                { label: "Engineering", budgeted: "$40,000", actual: "$16,000", pct: 40 },
                { label: "Sales", budgeted: "$18,000", actual: "$9,900", pct: 55 },
              ].map(({ label, budgeted, actual, pct }) => (
                <div key={label} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{label}</span>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono tabular-nums">
                      <span>{actual}</span>
                      <span className="text-muted-foreground/40">/</span>
                      <span>{budgeted}</span>
                      <span className={`font-sans font-medium ${pct > 80 ? "text-amber-500/70" : "text-emerald-500/70"}`}>{pct}%</span>
                    </div>
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
          </div>
        </div>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal className="space-y-6 sm:space-y-10">
      <Section title="Overview" description="A summary of your budgets and their current status.">
        <div className="space-y-4">
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
            <StatCard title="Total Budgets" value={budgets.length.toString()} icon={Target} />
            <StatCard title="Active" value={activeBudgets.toString()} icon={Target} />
          </div>
          <div className="flex justify-end flex-wrap">
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
            <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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

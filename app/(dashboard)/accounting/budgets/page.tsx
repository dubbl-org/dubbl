"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Target } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";

interface Budget {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  lines?: { total: number }[];
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
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/budgets?limit=100", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setBudgets(data.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const activeBudgets = budgets.filter((b) => b.isActive).length;

  if (!loading && budgets.length === 0) {
    return (
      <div className="space-y-10">
        <Section title="Budgets" description="Plan and track your financial budgets.">
          <EmptyState
            icon={Target}
            title="No budgets yet"
            description="Create your first budget to start tracking spending against targets."
          >
            <Button
              onClick={() => router.push("/accounting/budgets/new")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Budget
            </Button>
          </EmptyState>
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <Section title="Overview" description="A summary of your budgets and their current status.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard title="Total Budgets" value={budgets.length.toString()} icon={Target} />
            <StatCard title="Active" value={activeBudgets.toString()} icon={Target} />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => router.push("/accounting/budgets/new")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Budget
            </Button>
          </div>
        </div>
      </Section>

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
    </div>
  );
}

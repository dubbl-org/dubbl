"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DollarSign,
  ArrowLeftRight,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";

interface Entry {
  id: string;
  entryNumber: number;
  date: string;
  description: string;
  status: "draft" | "posted" | "void";
  totalDebit: string;
}

const columns: Column<Entry>[] = [
  {
    key: "number",
    header: "#",
    className: "w-16",
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground">
        {r.entryNumber}
      </span>
    ),
  },
  {
    key: "date",
    header: "Date",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.date}</span>,
  },
  {
    key: "description",
    header: "Description",
    render: (r) => <span className="text-sm font-medium">{r.description}</span>,
  },
  {
    key: "status",
    header: "Status",
    className: "w-24",
    render: (r) => (
      <Badge
        variant="outline"
        className={
          r.status === "posted"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
            : r.status === "void"
            ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
            : ""
        }
      >
        {r.status}
      </Badge>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {formatMoney(Math.round(parseFloat(r.totalDebit) * 100))}
      </span>
    ),
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [stats, setStats] = useState({
    totalAssets: "0.00",
    totalEntries: 0,
    totalAccounts: 0,
    netIncome: "0.00",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = localStorage.getItem("activeOrgId");
    if (!id) return;
    const headers = { "x-organization-id": id };

    Promise.all([
      fetch("/api/v1/entries?limit=10", { headers }).then((r) => r.json()),
      fetch("/api/v1/reports/trial-balance", { headers }).then((r) => r.json()).catch(() => null),
    ])
      .then(([entriesData, report]) => {
        if (entriesData.entries) {
          setEntries(
            entriesData.entries.map((e: Record<string, string | number>) => ({
              ...e,
              totalDebit: (e.totalDebit as string) || "0.00",
            }))
          );
          setStats((s) => ({ ...s, totalEntries: entriesData.total || 0 }));
        }
        if (report?.accounts) {
          const assets = report.accounts
            .filter((a: Record<string, string>) => a.type === "asset")
            .reduce(
              (sum: number, a: Record<string, string>) =>
                sum + parseFloat(a.balance || "0"),
              0
            );
          setStats((s) => ({
            ...s,
            totalAssets: assets.toFixed(2),
            totalAccounts: report.accounts.length,
          }));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Your bookkeeping at a glance."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Assets"
          value={formatMoney(Math.round(parseFloat(stats.totalAssets) * 100))}
          icon={DollarSign}
        />
        <StatCard
          title="Journal Entries"
          value={stats.totalEntries.toString()}
          icon={ArrowLeftRight}
        />
        <StatCard
          title="Accounts"
          value={stats.totalAccounts.toString()}
          icon={BookOpen}
        />
        <StatCard
          title="Net Income"
          value={formatMoney(Math.round(parseFloat(stats.netIncome) * 100))}
          icon={TrendingUp}
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Recent Entries
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => router.push("/transactions")}
          >
            View all
          </Button>
        </div>
        <DataTable
          columns={columns}
          data={entries}
          loading={loading}
          emptyMessage="No journal entries yet."
          onRowClick={(r) => router.push(`/transactions/${r.id}`)}
        />
      </div>
    </div>
  );
}

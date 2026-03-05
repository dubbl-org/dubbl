"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  DollarSign,
  ArrowLeftRight,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";
import { BrandLoader } from "@/components/dashboard/brand-loader";


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
      .then(() => devDelay())
      .finally(() => setLoading(false));
  }, []);

  return (
    <MotionConfig reducedMotion="never">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loader"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: "blur(6px)" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <BrandLoader />
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
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

            <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
              {/* Left: Recent Entries */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold">Recent Entries</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => router.push("/accounting")}
                  >
                    View all
                  </Button>
                </div>
                <DataTable
                  columns={columns}
                  data={entries}
                  loading={loading}
                  emptyMessage="No journal entries yet."
                  emptyAction={{
                    label: "Create your first entry",
                    onClick: () => router.push("/accounting/new"),
                  }}
                  onRowClick={(r) => router.push(`/accounting/${r.id}`)}
                />
              </div>

              {/* Right: Activity Feed */}
              <div>
                <ActivityFeed />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  BookOpen,
  FileText,
  Users,
  AlertTriangle,
  Gauge,
} from "lucide-react";
import { GrainGradient } from "@paper-design/shaders-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { cn } from "@/lib/utils";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";

const GREETINGS_MORNING = [
  "Good morning",
  "Rise and shine",
  "Morning",
  "Top of the morning",
];

const GREETINGS_AFTERNOON = [
  "Good afternoon",
  "Hope your afternoon is going well",
  "Afternoon",
];

const GREETINGS_EVENING = [
  "Good evening",
  "Evening",
  "Hope you had a great day",
];

const GREETINGS_ANYTIME = [
  "Welcome back",
  "Hey there",
  "Nice to see you",
  "Hello",
  "Hi there",
  "Great to have you back",
  "Ready to go",
];

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function pickGreeting(): string {
  const now = new Date();
  const hour = now.getHours();
  const day = DAY_NAMES[now.getDay()];

  const timePool =
    hour >= 5 && hour < 12
      ? GREETINGS_MORNING
      : hour >= 12 && hour < 17
      ? GREETINGS_AFTERNOON
      : GREETINGS_EVENING;

  const allOptions = [
    ...timePool,
    ...GREETINGS_ANYTIME,
    `Happy ${day}`,
  ];

  return allOptions[Math.floor(Math.random() * allOptions.length)];
}

interface Entry {
  id: string;
  entryNumber: number;
  date: string;
  description: string;
  status: "draft" | "posted" | "void";
  totalDebit: string;
}

interface PnLAccount {
  accountName: string;
  balance: number;
}

interface PnLData {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  expenses: PnLAccount[];
}

interface AgingBucket {
  label: string;
  total: number;
  count: number;
}

interface AgingData {
  buckets: AgingBucket[];
  grandTotal: number;
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

const BUCKET_COLORS = [
  "bg-emerald-500",
  "bg-amber-500",
  "bg-orange-500",
  "bg-red-400",
  "bg-red-600",
];

function AgingColumn({
  title,
  total,
  buckets,
}: {
  title: string;
  total: number;
  buckets: AgingBucket[];
}) {
  const maxBucket = Math.max(...buckets.map((b) => b.total), 1);

  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums">
        {formatMoney(total)}
      </p>
      <div className="mt-3 space-y-2">
        {buckets.map((bucket, i) => {
          const pct = (bucket.total / maxBucket) * 100;
          return (
            <div key={bucket.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{bucket.label}</span>
                <span className="font-mono tabular-nums">
                  {formatMoney(bucket.total)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    BUCKET_COLORS[i]
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiItem({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="text-center">
      <p className={cn(
        "text-lg font-bold font-mono tabular-nums",
        good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      )}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] || "";
  const [greeting] = useState(() => pickGreeting());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pnl, setPnl] = useState<PnLData>({
    totalRevenue: 0,
    totalExpenses: 0,
    netIncome: 0,
    expenses: [],
  });
  const [receivables, setReceivables] = useState<AgingData>({
    buckets: [],
    grandTotal: 0,
  });
  const [payables, setPayables] = useState<AgingData>({
    buckets: [],
    grandTotal: 0,
  });
  const [loading, setLoading] = useState(true);
  const [sparklines, setSparklines] = useState<{
    revenue: number[];
    expenses: number[];
    netIncome: number[];
  }>({ revenue: [], expenses: [], netIncome: [] });
  const [budgetAlerts, setBudgetAlerts] = useState<
    { accountName: string; pct: number; budgeted: number; actual: number }[]
  >([]);
  const [ratios, setRatios] = useState<{
    currentRatio: number | null;
    quickRatio: number | null;
    grossMargin: number | null;
    netMargin: number | null;
    dso: number | null;
    dpo: number | null;
  } | null>(null);
  const [actionAlerts, setActionAlerts] = useState<{
    overdueInvoices: { count: number; total: number };
    overdueBills: { count: number; total: number };
    uncategorizedTransactions: number;
    accountsNeedingReconciliation: { bankAccountName: string; lastReconDate: string | null }[];
  } | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("activeOrgId");
    if (!id) return;
    const headers = { "x-organization-id": id };

    Promise.all([
      fetch("/api/v1/entries?limit=10", { headers }).then((r) => r.json()),
      fetch("/api/v1/reports/profit-and-loss", { headers })
        .then((r) => r.json())
        .catch(() => null),
      fetch("/api/v1/reports/aged-receivables", { headers })
        .then((r) => r.json())
        .catch(() => null),
      fetch("/api/v1/reports/aged-payables", { headers })
        .then((r) => r.json())
        .catch(() => null),
    ])
      .then(([entriesData, pnlData, arData, apData]) => {
        if (entriesData.entries) {
          setEntries(
            entriesData.entries.map((e: Record<string, string | number>) => ({
              ...e,
              totalDebit: (e.totalDebit as string) || "0.00",
            }))
          );
        }
        if (pnlData) {
          setPnl({
            totalRevenue: pnlData.totalRevenue || 0,
            totalExpenses: pnlData.totalExpenses || 0,
            netIncome: pnlData.netIncome || 0,
            expenses: pnlData.expenses || [],
          });
        }
        if (arData) setReceivables(arData);
        if (apData) setPayables(apData);
      })
      .then(() => devDelay())
      .finally(() => setLoading(false));

    // Load sparkline trends in background
    fetch("/api/v1/reports/monthly-trends?months=6", { headers })
      .then((r) => r.json())
      .then((data) => {
        if (data.revenueSparkline) {
          setSparklines({
            revenue: data.revenueSparkline,
            expenses: data.expenseSparkline,
            netIncome: data.netIncomeSparkline,
          });
        }
      })
      .catch(() => {});

    // Load budget alerts in background
    fetch("/api/v1/reports/budget-vs-actual", { headers })
      .then((r) => r.json())
      .then((data) => {
        if (data.comparisons) {
          const alerts = data.comparisons
            .filter(
              (c: { budgeted: number; actual: number }) =>
                c.budgeted > 0 && c.actual / c.budgeted >= 0.9
            )
            .map((c: { accountName: string; budgeted: number; actual: number }) => ({
              accountName: c.accountName,
              pct: Math.round((c.actual / c.budgeted) * 100),
              budgeted: c.budgeted,
              actual: c.actual,
            }));
          setBudgetAlerts(alerts);
        }
      })
      .catch(() => {});

    // Load financial ratios in background
    fetch("/api/v1/reports/financial-ratios", { headers })
      .then((r) => r.json())
      .then((data) => {
        if (data.ratios) setRatios(data.ratios);
      })
      .catch(() => {});

    // Load action alerts in background
    fetch("/api/v1/dashboard/alerts", { headers })
      .then((r) => r.json())
      .then((data) => setActionAlerts(data))
      .catch(() => {});
  }, []);

  const receivablesCount = receivables.buckets.reduce(
    (sum, b) => sum + b.count,
    0
  );
  const payablesCount = payables.buckets.reduce(
    (sum, b) => sum + b.count,
    0
  );

  const maxRevExp = Math.max(pnl.totalRevenue, pnl.totalExpenses, 1);
  const revenuePct = (pnl.totalRevenue / maxRevExp) * 100;
  const expensesPct = (pnl.totalExpenses / maxRevExp) * 100;

  const topExpenses = [...pnl.expenses]
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 4);

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
            {/* Section A: Greeting Banner */}
            <div className="relative overflow-hidden rounded-2xl">
              <GrainGradient
                className="pointer-events-none !absolute !inset-0 !rounded-none"
                width="100%"
                height="100%"
                colors={[
                  "#d1fae5",
                  "#a7f3d0",
                  "#6ee7b7",
                  "#34d399",
                  "#10b981",
                  "#34d399",
                  "#a7f3d0",
                ]}
                colorBack="#34d399"
                softness={1}
                intensity={0.8}
                noise={0.9}
                shape="wave"
                scale={3.5}
                speed={0.2}
              />
              <div className="relative p-5 sm:p-8">
                <h2 className="text-xl sm:text-2xl font-bold text-emerald-950">
                  {greeting}{firstName ? `, ${firstName}` : ""}
                </h2>
                <p className="mt-1 max-w-lg text-sm text-emerald-950/70">
                  Here is your financial overview. Jump into any section to get
                  started or continue where you left off.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-950 text-white hover:bg-emerald-900"
                    onClick={() => router.push("/accounting/accounts")}
                  >
                    <Landmark className="mr-1.5 size-3.5" />
                    Accounts
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-950/10 text-emerald-950 hover:bg-emerald-950/20 border-0"
                    onClick={() => openDrawer("entry")}
                  >
                    <BookOpen className="mr-1.5 size-3.5" />
                    New entry
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-950/10 text-emerald-950 hover:bg-emerald-950/20 border-0"
                    onClick={() => openDrawer("invoice")}
                  >
                    <FileText className="mr-1.5 size-3.5" />
                    New invoice
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-950/10 text-emerald-950 hover:bg-emerald-950/20 border-0"
                    onClick={() => router.push("/contacts")}
                  >
                    <Users className="mr-1.5 size-3.5" />
                    Contacts
                  </Button>
                </div>
              </div>
            </div>

            {/* Budget Alerts */}
            {budgetAlerts.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-600" />
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Budget Alerts
                  </p>
                </div>
                <div className="space-y-1">
                  {budgetAlerts.slice(0, 3).map((alert) => (
                    <div
                      key={alert.accountName}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-amber-700 dark:text-amber-400">
                        {alert.accountName}
                      </span>
                      <span
                        className={cn(
                          "font-mono tabular-nums font-medium",
                          alert.pct >= 100
                            ? "text-red-600"
                            : "text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {alert.pct}% used ({formatMoney(alert.actual)} / {formatMoney(alert.budgeted)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section B: Stat Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <StatCard
                title="Revenue"
                value={formatMoney(pnl.totalRevenue)}
                icon={TrendingUp}
                sparklineData={sparklines.revenue.length > 1 ? sparklines.revenue : undefined}
              />
              <StatCard
                title="Expenses"
                value={formatMoney(pnl.totalExpenses)}
                icon={TrendingDown}
                sparklineData={sparklines.expenses.length > 1 ? sparklines.expenses : undefined}
              />
              <StatCard
                title="Net Income"
                value={formatMoney(pnl.netIncome)}
                icon={DollarSign}
                changeType={pnl.netIncome >= 0 ? "positive" : "negative"}
                sparklineData={sparklines.netIncome.length > 1 ? sparklines.netIncome : undefined}
              />
              <StatCard
                title="Receivables"
                value={formatMoney(receivables.grandTotal)}
                icon={ArrowDownLeft}
                change={`${receivablesCount} outstanding`}
                changeType="neutral"
              />
              <StatCard
                title="Payables"
                value={formatMoney(payables.grandTotal)}
                icon={ArrowUpRight}
                change={`${payablesCount} outstanding`}
                changeType="neutral"
              />
            </div>

            {/* Section C: Financial Health */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Revenue vs Expenses */}
              <div className="rounded-lg border bg-card p-5">
                <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                  Revenue vs Expenses
                </h3>
                <div className="mt-4 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Revenue</span>
                      <span className="font-mono text-sm tabular-nums font-medium">
                        {formatMoney(pnl.totalRevenue)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${revenuePct}%` }}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Expenses</span>
                      <span className="font-mono text-sm tabular-nums font-medium">
                        {formatMoney(pnl.totalExpenses)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-red-500 transition-all"
                        style={{ width: `${expensesPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-sm text-muted-foreground">
                      Net Income
                    </span>
                    <span
                      className={cn(
                        "font-mono text-sm tabular-nums font-semibold",
                        pnl.netIncome >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {formatMoney(pnl.netIncome)}
                    </span>
                  </div>
                </div>
                {topExpenses.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                      Top Expenses
                    </p>
                    <div className="space-y-2">
                      {topExpenses.map((exp) => (
                        <div
                          key={exp.accountName}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="truncate text-muted-foreground">
                            {exp.accountName}
                          </span>
                          <span className="ml-2 shrink-0 font-mono text-xs tabular-nums">
                            {formatMoney(exp.balance)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Aging Summary */}
              <div className="rounded-lg border bg-card p-5">
                <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                  Aging Summary
                </h3>
                <div className="mt-4 grid grid-cols-2 gap-6">
                  <AgingColumn
                    title="Receivables"
                    total={receivables.grandTotal}
                    buckets={receivables.buckets}
                  />
                  <AgingColumn
                    title="Payables"
                    total={payables.grandTotal}
                    buckets={payables.buckets}
                  />
                </div>
              </div>
            </div>

            {/* Financial KPIs */}
            {ratios && Object.values(ratios).some((v) => v !== null) && (
              <div className="rounded-lg border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                    Financial KPIs
                  </h3>
                  <Gauge className="size-4 text-muted-foreground/50" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                  {ratios.currentRatio !== null && (
                    <KpiItem label="Current Ratio" value={`${ratios.currentRatio}x`} good={ratios.currentRatio >= 1} />
                  )}
                  {ratios.quickRatio !== null && (
                    <KpiItem label="Quick Ratio" value={`${ratios.quickRatio}x`} good={ratios.quickRatio >= 1} />
                  )}
                  {ratios.grossMargin !== null && (
                    <KpiItem label="Gross Margin" value={`${ratios.grossMargin}%`} good={ratios.grossMargin > 0} />
                  )}
                  {ratios.netMargin !== null && (
                    <KpiItem label="Net Margin" value={`${ratios.netMargin}%`} good={ratios.netMargin > 0} />
                  )}
                  {ratios.dso !== null && (
                    <KpiItem label="DSO" value={`${ratios.dso}d`} good={ratios.dso <= 45} />
                  )}
                  {ratios.dpo !== null && (
                    <KpiItem label="DPO" value={`${ratios.dpo}d`} good={ratios.dpo <= 60} />
                  )}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            {actionAlerts && (actionAlerts.overdueInvoices.count > 0 || actionAlerts.overdueBills.count > 0 || actionAlerts.uncategorizedTransactions > 0 || actionAlerts.accountsNeedingReconciliation.length > 0) && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {actionAlerts.overdueInvoices.count > 0 && (
                  <button
                    onClick={() => router.push("/sales")}
                    className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-left transition-colors hover:bg-red-100 dark:hover:bg-red-950/50"
                  >
                    <p className="text-xs font-medium text-red-800 dark:text-red-300">Overdue Invoices</p>
                    <p className="text-lg font-bold font-mono tabular-nums text-red-600 mt-0.5">{actionAlerts.overdueInvoices.count}</p>
                    <p className="text-[11px] text-red-600/70 font-mono tabular-nums">{formatMoney(actionAlerts.overdueInvoices.total)} outstanding</p>
                  </button>
                )}
                {actionAlerts.overdueBills.count > 0 && (
                  <button
                    onClick={() => router.push("/purchases")}
                    className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 p-3 text-left transition-colors hover:bg-orange-100 dark:hover:bg-orange-950/50"
                  >
                    <p className="text-xs font-medium text-orange-800 dark:text-orange-300">Overdue Bills</p>
                    <p className="text-lg font-bold font-mono tabular-nums text-orange-600 mt-0.5">{actionAlerts.overdueBills.count}</p>
                    <p className="text-[11px] text-orange-600/70 font-mono tabular-nums">{formatMoney(actionAlerts.overdueBills.total)} to pay</p>
                  </button>
                )}
                {actionAlerts.uncategorizedTransactions > 0 && (
                  <button
                    onClick={() => router.push("/accounting/banking")}
                    className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 text-left transition-colors hover:bg-blue-100 dark:hover:bg-blue-950/50"
                  >
                    <p className="text-xs font-medium text-blue-800 dark:text-blue-300">Uncategorized Transactions</p>
                    <p className="text-lg font-bold font-mono tabular-nums text-blue-600 mt-0.5">{actionAlerts.uncategorizedTransactions}</p>
                    <p className="text-[11px] text-blue-600/70">Need categorization</p>
                  </button>
                )}
                {actionAlerts.accountsNeedingReconciliation.length > 0 && (
                  <button
                    onClick={() => router.push("/accounting/banking")}
                    className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 p-3 text-left transition-colors hover:bg-violet-100 dark:hover:bg-violet-950/50"
                  >
                    <p className="text-xs font-medium text-violet-800 dark:text-violet-300">Needs Reconciliation</p>
                    <p className="text-lg font-bold font-mono tabular-nums text-violet-600 mt-0.5">{actionAlerts.accountsNeedingReconciliation.length}</p>
                    <p className="text-[11px] text-violet-600/70">bank account{actionAlerts.accountsNeedingReconciliation.length !== 1 ? "s" : ""}</p>
                  </button>
                )}
              </div>
            )}

            {/* Section D: Recent Activity */}
            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
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
                    onClick: () => openDrawer("entry"),
                  }}
                  onRowClick={(r) => router.push(`/accounting/${r.id}`)}
                />
              </div>
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

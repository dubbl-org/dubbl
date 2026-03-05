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

export default function DashboardPage() {
  const router = useRouter();
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
              <div className="relative p-8">
                <h2 className="text-2xl font-bold text-emerald-950">
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
                    onClick={() => router.push("/accounting/new")}
                  >
                    <BookOpen className="mr-1.5 size-3.5" />
                    New entry
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-950/10 text-emerald-950 hover:bg-emerald-950/20 border-0"
                    onClick={() => router.push("/sales/new")}
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

            {/* Section B: Stat Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <StatCard
                title="Revenue"
                value={formatMoney(pnl.totalRevenue)}
                icon={TrendingUp}
              />
              <StatCard
                title="Expenses"
                value={formatMoney(pnl.totalExpenses)}
                icon={TrendingDown}
              />
              <StatCard
                title="Net Income"
                value={formatMoney(pnl.netIncome)}
                icon={DollarSign}
                changeType={pnl.netIncome >= 0 ? "positive" : "negative"}
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

            {/* Section D: Recent Activity */}
            <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
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

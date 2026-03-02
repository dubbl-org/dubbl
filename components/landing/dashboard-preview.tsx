"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Container } from "@/components/shared/container";
import { SectionHeader } from "@/components/shared/section-header";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const tabs = ["Transactions", "Reports", "Accounts"] as const;
type Tab = (typeof tabs)[number];

/* ------------------------------------------------------------------ */
/*  Transactions Tab                                                   */
/* ------------------------------------------------------------------ */
function TransactionsTab() {
  const rows = [
    {
      date: "Mar 01",
      desc: "Client Invoice #1024",
      category: "Income",
      debit: "$12,500.00",
      credit: "",
      balance: "$48,250.00",
    },
    {
      date: "Feb 28",
      desc: "Office Rent — Q1",
      category: "Expense",
      debit: "",
      credit: "$3,200.00",
      balance: "$35,750.00",
    },
    {
      date: "Feb 27",
      desc: "Software Subscription",
      category: "Expense",
      debit: "",
      credit: "$299.00",
      balance: "$38,950.00",
    },
    {
      date: "Feb 26",
      desc: "Consulting Revenue",
      category: "Income",
      debit: "$8,000.00",
      credit: "",
      balance: "$39,249.00",
    },
    {
      date: "Feb 25",
      desc: "Equipment Purchase",
      category: "Asset",
      debit: "",
      credit: "$1,450.00",
      balance: "$31,249.00",
    },
    {
      date: "Feb 24",
      desc: "Freelance Payment",
      category: "Income",
      debit: "$4,200.00",
      credit: "",
      balance: "$32,699.00",
    },
  ];

  const categoryStyle: Record<string, string> = {
    Income:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400",
    Expense:
      "bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-400",
    Asset:
      "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400",
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 text-left">Date</th>
            <th className="px-4 py-3 text-left">Description</th>
            <th className="px-4 py-3 text-left">Category</th>
            <th className="px-4 py-3 text-right">Debit</th>
            <th className="px-4 py-3 text-right">Credit</th>
            <th className="px-4 py-3 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <motion.tr
              key={i}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: i * 0.055, ease: "easeOut" }}
              className="group border-b border-border/50 transition-colors last:border-0 hover:bg-muted/40"
            >
              <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
                {row.date}
              </td>
              <td className="px-4 py-3.5 font-medium text-foreground">
                {row.desc}
              </td>
              <td className="px-4 py-3.5">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                    categoryStyle[row.category] ?? ""
                  )}
                >
                  {row.category}
                </span>
              </td>
              <td className="px-4 py-3.5 text-right font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                {row.debit || (
                  <span className="text-muted-foreground/30">&mdash;</span>
                )}
              </td>
              <td className="px-4 py-3.5 text-right font-medium tabular-nums text-red-500 dark:text-red-400">
                {row.credit || (
                  <span className="text-muted-foreground/30">&mdash;</span>
                )}
              </td>
              <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-foreground">
                {row.balance}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reports Tab                                                        */
/* ------------------------------------------------------------------ */
function ReportsTab() {
  const kpis = [
    { label: "Total Revenue", value: "$124,580", change: "+12.5%", up: true },
    { label: "Total Expenses", value: "$68,240", change: "+3.2%", up: false },
    { label: "Net Profit", value: "$56,340", change: "+18.7%", up: true },
    { label: "Profit Margin", value: "45.2%", change: "+4.1pp", up: true },
  ];

  const linePoints = [
    [0, 80],
    [33, 72],
    [66, 64],
    [99, 69],
    [132, 55],
    [165, 46],
    [198, 50],
    [231, 38],
    [264, 34],
    [297, 28],
    [330, 22],
    [360, 16],
  ] as const;

  const chartPolyline = linePoints.map(([x, y]) => `${x},${y}`).join(" ");
  const areaPolygon = `0,100 ${chartPolyline} 360,100`;

  const barData = [
    { month: "Sep", value: 45 },
    { month: "Oct", value: 62 },
    { month: "Nov", value: 55 },
    { month: "Dec", value: 78 },
    { month: "Jan", value: 68 },
    { month: "Feb", value: 85 },
  ];

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.07 }}
            className="rounded-xl border border-border bg-background p-4"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {kpi.label}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {kpi.value}
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              {kpi.up ? (
                <TrendingUp className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <TrendingDown className="size-3.5 text-red-500 dark:text-red-400" />
              )}
              <span
                className={cn(
                  "text-xs font-semibold",
                  kpi.up
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-500 dark:text-red-400"
                )}
              >
                {kpi.change}
              </span>
              <span className="text-[11px] text-muted-foreground">
                vs last mo.
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Line chart */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="rounded-xl border border-border bg-background p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Revenue Trend
            </p>
            <span className="rounded-md bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              6 months
            </span>
          </div>
          <svg
            viewBox="0 0 360 100"
            className="h-40 w-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="previewAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  className="[stop-color:theme(colors.emerald.500)]"
                  stopOpacity="0.18"
                />
                <stop
                  offset="100%"
                  className="[stop-color:theme(colors.emerald.500)]"
                  stopOpacity="0.01"
                />
              </linearGradient>
            </defs>
            {/* Horizontal grid lines */}
            {[20, 40, 60, 80].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="360"
                y2={y}
                className="stroke-border"
                strokeWidth="0.5"
                strokeDasharray="4 4"
              />
            ))}
            <motion.polygon
              points={areaPolygon}
              fill="url(#previewAreaGrad)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1 }}
            />
            <motion.polyline
              points={chartPolyline}
              fill="none"
              className="stroke-emerald-500"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.6, ease: "easeOut" }}
            />
            {linePoints.map(([x, y], i) => (
              <motion.circle
                key={i}
                cx={x}
                cy={y}
                r="2.5"
                className="fill-emerald-500"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: 0.8 + i * 0.06 }}
              />
            ))}
          </svg>
        </motion.div>

        {/* Bar chart */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="rounded-xl border border-border bg-background p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Monthly Expenses
            </p>
            <span className="rounded-md bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              6 months
            </span>
          </div>
          <div className="flex h-40 items-end justify-between gap-3 pt-2">
            {barData.map((bar, i) => (
              <div
                key={i}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <motion.div
                  className="w-full rounded-t-md bg-gradient-to-t from-emerald-600/90 to-emerald-400/90"
                  initial={{ height: 0 }}
                  animate={{ height: `${bar.value}%` }}
                  transition={{
                    duration: 0.5,
                    delay: 0.5 + i * 0.07,
                    ease: "easeOut",
                  }}
                />
                <span className="text-[10px] font-medium text-muted-foreground">
                  {bar.month}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Accounts Tab                                                       */
/* ------------------------------------------------------------------ */
function AccountGroup({
  group,
  index,
}: {
  group: {
    name: string;
    code: string;
    balance: string;
    color: string;
    children: { name: string; code: string; balance: string }[];
  };
  index: number;
}) {
  const [open, setOpen] = useState(true);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.1 }}
      className="overflow-hidden rounded-xl border border-border"
    >
      {/* Group header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-b border-border bg-muted/40 px-5 py-3.5 transition-colors hover:bg-muted/60"
      >
        <div className="flex items-center gap-3">
          <div className={cn("h-3.5 w-1 rounded-full", group.color)} />
          {open ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold text-foreground">
            {group.name}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {group.code}
          </span>
        </div>
        <span className="text-sm font-bold tabular-nums text-foreground">
          {group.balance}
        </span>
      </button>

      {/* Children */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {group.children.map((child, ci) => (
              <div
                key={ci}
                className="flex items-center justify-between border-b border-border/50 px-5 py-3 pl-14 text-sm transition-colors last:border-0 hover:bg-muted/20"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground/50">
                    {child.code}
                  </span>
                  <span className="text-muted-foreground">{child.name}</span>
                </div>
                <span className="font-medium tabular-nums text-foreground">
                  {child.balance}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AccountsTab() {
  const tree = [
    {
      name: "Assets",
      code: "1000",
      balance: "$156,400.00",
      color: "bg-emerald-500",
      children: [
        { name: "Cash & Equivalents", code: "1010", balance: "$48,250.00" },
        { name: "Accounts Receivable", code: "1200", balance: "$67,150.00" },
        { name: "Equipment & Property", code: "1500", balance: "$41,000.00" },
      ],
    },
    {
      name: "Liabilities",
      code: "2000",
      balance: "$42,800.00",
      color: "bg-red-500",
      children: [
        { name: "Accounts Payable", code: "2010", balance: "$28,300.00" },
        { name: "Long-term Loans", code: "2500", balance: "$14,500.00" },
      ],
    },
    {
      name: "Equity",
      code: "3000",
      balance: "$113,600.00",
      color: "bg-blue-500",
      children: [
        { name: "Retained Earnings", code: "3100", balance: "$89,600.00" },
        { name: "Owner\u2019s Capital", code: "3200", balance: "$24,000.00" },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {tree.map((group, gi) => (
        <AccountGroup key={gi} group={group} index={gi} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Section                                                       */
/* ------------------------------------------------------------------ */
export function DashboardPreview() {
  const [activeTab, setActiveTab] = useState<Tab>("Transactions");

  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      {/* Subtle background wash */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-muted/30 via-muted/10 to-transparent" />

      <Container className="relative">
        <SectionHeader
          badge="Preview"
          title="See it in action"
          subtitle="A full-featured accounting dashboard designed for clarity and speed."
        />

        {/* Pill tab switcher */}
        <div className="mb-10 flex justify-center">
          <div className="inline-flex rounded-full border border-border bg-muted/60 p-1 backdrop-blur-sm">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "relative rounded-full px-5 py-2 text-sm font-medium transition-colors duration-200",
                  activeTab === tab
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {activeTab === tab && (
                  <motion.div
                    layoutId="dashTabPill"
                    className="absolute inset-0 rounded-full bg-background shadow-sm ring-1 ring-border/50"
                    transition={{
                      type: "spring",
                      bounce: 0.18,
                      duration: 0.5,
                    }}
                  />
                )}
                <span className="relative z-10">{tab}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Dashboard frame — full container width, no max-w constraint */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/[0.06] dark:shadow-black/30">
          {/* Window chrome */}
          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-5 py-3.5">
            <div className="size-3 rounded-full bg-[#ff5f57]" />
            <div className="size-3 rounded-full bg-[#febc2e]" />
            <div className="size-3 rounded-full bg-[#28c840]" />
            <div className="mx-auto rounded-md bg-muted/80 px-4 py-1 text-xs font-medium text-muted-foreground">
              dubbl &mdash; {activeTab}
            </div>
            {/* Spacer to balance the dots */}
            <div className="w-[52px]" />
          </div>

          {/* Content area */}
          <div className="p-5 md:p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {activeTab === "Transactions" && <TransactionsTab />}
                {activeTab === "Reports" && <ReportsTab />}
                {activeTab === "Accounts" && <AccountsTab />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </Container>
    </section>
  );
}

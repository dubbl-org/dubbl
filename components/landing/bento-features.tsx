"use client";

import { motion } from "motion/react";
import {
  Globe,
  Code2,
  Plug,
  BookOpen,
  BarChart3,
  Shield,
  CheckCircle2,
  Clock,
  ArrowLeftRight,
  FileText,
  Edit3,
  Trash2,
  Link2,
} from "lucide-react";
import { GrainGradient } from "@paper-design/shaders-react";
import { Container } from "@/components/shared/container";
import { SectionHeader } from "@/components/shared/section-header";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Shared: Mini window chrome for mockup areas                       */
/* ------------------------------------------------------------------ */

function WindowChrome({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="size-2 rounded-full bg-rose-400/70" />
          <div className="size-2 rounded-full bg-amber-400/70" />
          <div className="size-2 rounded-full bg-emerald-400/70" />
        </div>
        <span className="text-[10px] font-medium text-muted-foreground">{title}</span>
      </div>
      {/* Content */}
      <div className="p-3">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mockup 1: Double-Entry Ledger — Real table with rows              */
/* ------------------------------------------------------------------ */

function LedgerMockup() {
  const rows = [
    { date: "Mar 01", account: "Cash (1000)", debit: "12,450.00", credit: "—" },
    { date: "Mar 01", account: "Revenue (4000)", debit: "—", credit: "12,450.00" },
    { date: "Mar 02", account: "Office Supplies (5200)", debit: "3,200.00", credit: "—" },
    { date: "Mar 02", account: "Accounts Payable (2000)", debit: "—", credit: "3,200.00" },
  ];

  const columns = ["Date", "Account", "Debit", "Credit"];

  return (
    <WindowChrome title="General Ledger — March 2026">
      <div className="overflow-hidden rounded-md border border-border">
        {/* Table header */}
        <div className="grid grid-cols-[60px_1fr_80px_80px] bg-muted/80 px-3 py-2">
          {columns.map((col) => (
            <span key={col} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {col}
            </span>
          ))}
        </div>
        {/* Table rows */}
        {rows.map((row, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            transition={{ delay: 0.2 + i * 0.08, duration: 0.3, ease: "easeOut" }}
            className={cn(
              "grid grid-cols-[60px_1fr_80px_80px] px-3 py-2 text-[11px]",
              i % 2 === 0 ? "bg-card" : "bg-muted/30"
            )}
          >
            <span className="text-muted-foreground">{row.date}</span>
            <span className="font-medium text-foreground">{row.account}</span>
            <span className={cn("tabular-nums", row.debit !== "—" ? "text-foreground font-medium" : "text-muted-foreground/40")}>
              {row.debit}
            </span>
            <span className={cn("tabular-nums", row.credit !== "—" ? "text-foreground font-medium" : "text-muted-foreground/40")}>
              {row.credit}
            </span>
          </motion.div>
        ))}
        {/* Totals row */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: false }}
          transition={{ delay: 0.6, duration: 0.3 }}
          className="grid grid-cols-[60px_1fr_80px_80px] border-t border-border bg-muted/50 px-3 py-2 text-[11px]"
        >
          <span />
          <span className="font-semibold text-muted-foreground">Total</span>
          <span className="font-bold tabular-nums text-foreground">15,650.00</span>
          <span className="font-bold tabular-nums text-foreground">15,650.00</span>
        </motion.div>
      </div>
      {/* Balance confirmation */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: false }}
        transition={{ delay: 0.75, duration: 0.3 }}
        className="mt-2.5 flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 dark:border-emerald-900 dark:bg-emerald-950/40"
      >
        <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
          Balanced — Debits equal Credits
        </span>
      </motion.div>
    </WindowChrome>
  );
}

/* ------------------------------------------------------------------ */
/*  Mockup 2: Financial Reports — KPI cards + SVG line chart          */
/* ------------------------------------------------------------------ */

function ReportsMockup() {
  const kpis = [
    { label: "Revenue", value: "$84.2k", change: "+12.4%", positive: true },
    { label: "Expenses", value: "$41.8k", change: "+3.1%", positive: false },
    { label: "Profit", value: "$42.3k", change: "+21.8%", positive: true },
  ];

  // SVG chart data points (normalized 0-1 range, mapped to viewBox)
  const revenuePoints = [0.2, 0.3, 0.25, 0.45, 0.4, 0.55, 0.5, 0.65, 0.6, 0.72, 0.78, 0.85];
  const expensePoints = [0.15, 0.2, 0.22, 0.28, 0.25, 0.3, 0.32, 0.35, 0.33, 0.38, 0.4, 0.42];

  const chartW = 280;
  const chartH = 90;
  const padX = 0;
  const padY = 8;

  function toPath(points: number[]) {
    return points
      .map((p, i) => {
        const x = padX + (i / (points.length - 1)) * (chartW - padX * 2);
        const y = chartH - padY - p * (chartH - padY * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  function toAreaPath(points: number[]) {
    const linePath = points
      .map((p, i) => {
        const x = padX + (i / (points.length - 1)) * (chartW - padX * 2);
        const y = chartH - padY - p * (chartH - padY * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const lastX = padX + ((points.length - 1) / (points.length - 1)) * (chartW - padX * 2);
    const firstX = padX;
    return `${linePath} L${lastX},${chartH} L${firstX},${chartH} Z`;
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <WindowChrome title="Financial Reports — FY 2026">
      {/* KPI row */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            transition={{ delay: 0.15 + i * 0.08, duration: 0.3 }}
            className="rounded-md border border-border bg-muted/40 px-2.5 py-2"
          >
            <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">{kpi.value}</p>
            <p
              className={cn(
                "mt-0.5 text-[10px] font-semibold tabular-nums",
                kpi.positive ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
              )}
            >
              {kpi.change}
            </p>
          </motion.div>
        ))}
      </div>

      {/* SVG Line chart */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: false }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="rounded-md border border-border bg-muted/20 p-2"
      >
        <svg viewBox={`0 0 ${chartW} ${chartH + 16}`} className="w-full" preserveAspectRatio="xMidYMid meet">
          {/* Horizontal grid lines */}
          {[0.25, 0.5, 0.75].map((frac) => {
            const y = chartH - padY - frac * (chartH - padY * 2);
            return (
              <line
                key={frac}
                x1={padX}
                x2={chartW - padX}
                y1={y}
                y2={y}
                className="stroke-border"
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />
            );
          })}

          {/* Revenue area fill */}
          <motion.path
            d={toAreaPath(revenuePoints)}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: false }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="fill-emerald-500/8 dark:fill-emerald-400/10"
          />

          {/* Revenue line */}
          <motion.path
            d={toPath(revenuePoints)}
            fill="none"
            className="stroke-emerald-500 dark:stroke-emerald-400"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: false }}
            transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
          />

          {/* Expenses line */}
          <motion.path
            d={toPath(expensePoints)}
            fill="none"
            className="stroke-amber-500 dark:stroke-amber-400"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 3"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: false }}
            transition={{ delay: 0.6, duration: 0.8, ease: "easeOut" }}
          />

          {/* X-axis month labels (show every 3rd) */}
          {months.map((m, i) => {
            if (i % 3 !== 0) return null;
            const x = padX + (i / (months.length - 1)) * (chartW - padX * 2);
            return (
              <text
                key={m}
                x={x}
                y={chartH + 12}
                className="fill-muted-foreground"
                fontSize={8}
                textAnchor="middle"
              >
                {m}
              </text>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="mt-1.5 flex items-center justify-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-0.5 w-4 rounded-full bg-emerald-500 dark:bg-emerald-400" />
            <span className="text-[9px] font-medium text-muted-foreground">Revenue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-0.5 w-4 rounded-full border-b border-dashed border-amber-500 dark:border-amber-400" />
            <span className="text-[9px] font-medium text-muted-foreground">Expenses</span>
          </div>
        </div>
      </motion.div>
    </WindowChrome>
  );
}

/* ------------------------------------------------------------------ */
/*  Mockup 3: Bank Reconciliation — Split view with match lines       */
/* ------------------------------------------------------------------ */

function ReconciliationMockup() {
  const bankItems = [
    { id: "TXN-4821", desc: "Shopify Deposit", amount: "+$4,250.00", status: "matched" as const },
    { id: "TXN-4822", desc: "AWS Invoice", amount: "-$1,840.00", status: "matched" as const },
    { id: "TXN-4823", desc: "Wire Transfer", amount: "+$8,600.00", status: "unmatched" as const },
    { id: "TXN-4824", desc: "Stripe Payout", amount: "+$2,190.00", status: "matched" as const },
  ];

  const journalItems = [
    { id: "JE-1042", desc: "Sales Revenue", amount: "$4,250.00", status: "matched" as const },
    { id: "JE-1043", desc: "Cloud Infrastructure", amount: "$1,840.00", status: "matched" as const },
    { id: "JE-????", desc: "No match found", amount: "—", status: "unmatched" as const },
    { id: "JE-1045", desc: "Payment Processing", amount: "$2,190.00", status: "matched" as const },
  ];

  return (
    <WindowChrome title="Bank Reconciliation — Checking ****4821">
      <div className="grid grid-cols-[1fr_24px_1fr] gap-0">
        {/* Bank Statement Column */}
        <div>
          <div className="mb-2 rounded-t-md bg-muted/80 px-2 py-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Bank Statement
            </span>
          </div>
          <div className="space-y-1.5">
            {bankItems.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: false }}
                transition={{ delay: 0.2 + i * 0.1, duration: 0.3, ease: "easeOut" }}
                className="rounded-md border border-border bg-card px-2 py-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-foreground">{item.desc}</span>
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      item.status === "matched"
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                    )}
                  />
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground">{item.id}</span>
                  <span className="text-[10px] font-medium tabular-nums text-foreground">{item.amount}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Connection lines column */}
        <div className="relative flex flex-col items-center justify-center">
          {bankItems.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: false }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.3 }}
              className="flex h-[52px] items-center"
            >
              {item.status === "matched" ? (
                <Link2 className="size-3 text-emerald-500 dark:text-emerald-400" />
              ) : (
                <div className="size-3 rounded-full border border-dashed border-amber-400" />
              )}
            </motion.div>
          ))}
        </div>

        {/* Journal Entries Column */}
        <div>
          <div className="mb-2 rounded-t-md bg-muted/80 px-2 py-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Journal Entries
            </span>
          </div>
          <div className="space-y-1.5">
            {journalItems.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: 12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: false }}
                transition={{ delay: 0.3 + i * 0.1, duration: 0.3, ease: "easeOut" }}
                className={cn(
                  "rounded-md border px-2 py-1.5",
                  item.status === "matched"
                    ? "border-border bg-card"
                    : "border-dashed border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-[10px] font-semibold",
                      item.status === "matched" ? "text-foreground" : "text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {item.desc}
                  </span>
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      item.status === "matched"
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                    )}
                  />
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground">{item.id}</span>
                  <span className="text-[10px] font-medium tabular-nums text-foreground">{item.amount}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false }}
        transition={{ delay: 0.8, duration: 0.3 }}
        className="mt-2.5 flex items-center justify-between rounded-md border border-border bg-muted/40 px-2.5 py-1.5"
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3" /> 3 matched
          </span>
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            <Clock className="size-3" /> 1 pending
          </span>
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">75% reconciled</span>
      </motion.div>
    </WindowChrome>
  );
}

/* ------------------------------------------------------------------ */
/*  Mockup 4: Audit Trail — Activity feed with avatars & timeline     */
/* ------------------------------------------------------------------ */

function AuditTrailMockup() {
  const events = [
    {
      user: "AW",
      name: "Alice Wang",
      action: "Created journal entry",
      entity: "JE-1042",
      entityType: "entry",
      time: "2 min ago",
      icon: FileText,
      color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    },
    {
      user: "BM",
      name: "Bob Martinez",
      action: "Approved invoice",
      entity: "INV-389",
      entityType: "invoice",
      time: "18 min ago",
      icon: CheckCircle2,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    },
    {
      user: "CS",
      name: "Carol Singh",
      action: "Updated account",
      entity: "4100 — Revenue",
      entityType: "account",
      time: "1 hour ago",
      icon: Edit3,
      color: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
    },
    {
      user: "SYS",
      name: "System",
      action: "Deleted draft entry",
      entity: "JE-1038",
      entityType: "entry",
      time: "3 hours ago",
      icon: Trash2,
      color: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
    },
  ];

  return (
    <WindowChrome title="Audit Trail — Activity Log">
      {/* Filter bar */}
      <div className="mb-3 flex items-center gap-2">
        {["All", "Entries", "Invoices", "Accounts"].map((filter, i) => (
          <span
            key={filter}
            className={cn(
              "rounded-md px-2 py-0.5 text-[9px] font-medium transition-colors",
              i === 0
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground"
            )}
          >
            {filter}
          </span>
        ))}
      </div>

      {/* Timeline feed */}
      <div className="relative space-y-0">
        {/* Timeline vertical line */}
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

        {events.map((evt, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            transition={{ delay: 0.15 + i * 0.1, duration: 0.3, ease: "easeOut" }}
            className="relative flex items-start gap-3 py-2"
          >
            {/* Avatar */}
            <div className="relative z-10 flex size-[30px] shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground ring-2 ring-card">
              {evt.user}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-[11px] font-semibold text-foreground">{evt.name}</span>
                  <span className="text-[10px] text-muted-foreground">{evt.action}</span>
                </div>
                <span className="shrink-0 text-[9px] text-muted-foreground/60">{evt.time}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <div className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium", evt.color)}>
                  <evt.icon className="size-2.5" />
                  {evt.entity}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Load more */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: false }}
        transition={{ delay: 0.7, duration: 0.3 }}
        className="mt-1 text-center"
      >
        <span className="cursor-pointer text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground">
          View full history
        </span>
      </motion.div>
    </WindowChrome>
  );
}

/* ------------------------------------------------------------------ */
/*  Main feature card data                                            */
/* ------------------------------------------------------------------ */

const mainFeatures = [
  {
    title: "Double-Entry Ledger",
    description:
      "Every transaction balances automatically. Debits always equal credits, enforced at the database level so your books stay accurate.",
    mockup: <LedgerMockup />,
    icon: BookOpen,
  },
  {
    title: "Financial Reports",
    description:
      "Balance sheets, P&L, and cash flow statements generated instantly. Always up-to-date, always audit-ready.",
    mockup: <ReportsMockup />,
    icon: BarChart3,
  },
  {
    title: "Bank Reconciliation",
    description:
      "Automatically match imported bank transactions to your journal entries. Spot discrepancies before they become problems.",
    mockup: <ReconciliationMockup />,
    icon: ArrowLeftRight,
  },
  {
    title: "Audit Trail",
    description:
      "Every change is logged with who, what, and when. Full compliance history at your fingertips for any audit.",
    mockup: <AuditTrailMockup />,
    icon: Shield,
  },
];

/* ------------------------------------------------------------------ */
/*  Secondary feature card data                                       */
/* ------------------------------------------------------------------ */

const secondaryFeatures = [
  {
    title: "Multi-Currency",
    description:
      "Transact in any currency with automatic rate conversion and realized gain/loss tracking.",
    icon: Globe,
    iconColor: "bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
  },
  {
    title: "API-First",
    description:
      "Every feature accessible via REST API. Build custom integrations and automations in minutes.",
    icon: Code2,
    iconColor: "bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
  },
  {
    title: "Bank Integrations",
    description:
      "Import global bank statement formats today and layer live bank connections in later without changing your reconciliation workflow.",
    icon: Plug,
    iconColor: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
  },
];

/* ------------------------------------------------------------------ */
/*  Exported component                                                */
/* ------------------------------------------------------------------ */

export function BentoFeatures() {
  return (
    <section id="features" className="py-16 md:py-24">
      <Container>
        <SectionHeader
          badge="Features"
          title="Powerful features for modern teams"
          subtitle="Everything your finance team needs — from double-entry bookkeeping to real-time reporting."
        />

        {/* ---- 2x2 Main Feature Cards ---- */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {mainFeatures.map((feature, i) => (
            <ScrollReveal key={feature.title} delay={i * 0.06}>
              <motion.div
                whileHover={{
                  scale: 1.01,
                  boxShadow: "0 16px 48px -12px rgba(0,0,0,0.1)",
                }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card"
              >
                {/* Mockup visual area */}
                <div className="relative overflow-hidden border-b border-border p-4 md:p-5">
                  <GrainGradient
                    className="pointer-events-none !absolute !inset-0 !rounded-none"
                    width="100%"
                    height="100%"
                    colors={["#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#34d399", "#a7f3d0"]}
                    colorBack="#34d399"
                    softness={1}
                    intensity={0.8}
                    noise={0.9}
                    shape="wave"
                    scale={3.5}
                    speed={0.2}
                  />
                  <div className="relative">{feature.mockup}</div>
                </div>

                {/* Text content */}
                <div className="flex flex-1 flex-col p-5 md:p-6">
                  <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-muted">
                    <feature.icon className="size-4.5 text-foreground" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>

        {/* ---- 3-column Secondary Feature Cards ---- */}
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {secondaryFeatures.map((feature, i) => (
            <ScrollReveal key={feature.title} delay={0.3 + i * 0.06}>
              <motion.div
                whileHover={{ scale: 1.015 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6"
              >
                <div
                  className={cn(
                    "mb-4 flex size-10 items-center justify-center rounded-lg",
                    feature.iconColor
                  )}
                >
                  <feature.icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

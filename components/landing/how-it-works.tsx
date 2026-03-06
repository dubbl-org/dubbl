"use client";

import { motion } from "motion/react";
import {
  CreditCard,
  Building2,
  FileText,
  Check,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  BarChart3,
  DollarSign,
  Percent,
} from "lucide-react";
import { GrainGradient } from "@paper-design/shaders-react";
import { Container } from "@/components/shared/container";
import { SectionHeader } from "@/components/shared/section-header";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Step 1: Connect — Real integration settings panel                 */
/* ------------------------------------------------------------------ */

const integrations = [
  {
    name: "Stripe",
    icon: CreditCard,
    status: "connected" as const,
    description: "Payment processing",
  },
  {
    name: "Plaid",
    icon: Building2,
    status: "connected" as const,
    description: "Bank accounts",
  },
  {
    name: "QuickBooks",
    icon: FileText,
    status: "pending" as const,
    description: "Accounting sync",
  },
];

function ConnectVisual() {
  return (
    <div className="rounded-xl rounded-b-none bg-card p-4">
      {/* Panel header */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: false }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="mb-3 flex items-center justify-between"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Integrations
        </span>
        <span className="text-[10px] text-muted-foreground">2 of 3 active</span>
      </motion.div>

      {/* Integration rows */}
      <div className="space-y-2">
        {integrations.map((item, i) => (
          <motion.div
            key={item.name}
            initial={{ opacity: 0, x: -14 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false }}
            transition={{ delay: 0.3 + i * 0.12, duration: 0.4 }}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
          >
            {/* Icon */}
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                item.status === "connected"
                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <item.icon className="size-3.5" />
            </div>

            {/* Name + description */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">{item.name}</p>
              <p className="text-[10px] text-muted-foreground">{item.description}</p>
            </div>

            {/* Status indicator + toggle */}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-[10px] font-medium",
                  item.status === "connected"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-500 dark:text-amber-400"
                )}
              >
                {item.status === "connected" ? "Active" : "Pending"}
              </span>
              {/* Toggle switch */}
              <div
                className={cn(
                  "relative h-4 w-7 rounded-full transition-colors",
                  item.status === "connected"
                    ? "bg-emerald-500"
                    : "bg-muted-foreground/20"
                )}
              >
                <div
                  className={cn(
                    "absolute top-0.5 size-3 rounded-full bg-card shadow-sm transition-transform",
                    item.status === "connected" ? "left-3.5" : "left-0.5"
                  )}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Connect more button */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false }}
        transition={{ delay: 0.7, duration: 0.35 }}
        className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-[10px] font-medium text-muted-foreground"
      >
        <span>+ Add integration</span>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2: Categorize — Real transaction categorization form          */
/* ------------------------------------------------------------------ */

function CategorizeVisual() {
  return (
    <div className="rounded-xl rounded-b-none bg-card p-4">
      {/* Transaction being categorized */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: false }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="mb-3"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Categorize Transaction
        </span>
      </motion.div>

      {/* Transaction row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="mb-3 flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5"
      >
        <div>
          <p className="text-xs font-semibold text-foreground">AWS Cloud Services</p>
          <p className="text-[10px] text-muted-foreground">Mar 1, 2026</p>
        </div>
        <span className="text-sm font-bold tabular-nums text-foreground">
          -$2,450.00
        </span>
      </motion.div>

      {/* Category selector dropdown */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false }}
        transition={{ delay: 0.45, duration: 0.4 }}
        className="mb-2.5"
      >
        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
          Category
        </label>
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-blue-400" />
            <span className="text-xs font-medium text-foreground">
              Software & Tools
            </span>
          </div>
          <ChevronDown className="size-3 text-muted-foreground" />
        </div>
      </motion.div>

      {/* Debit / Credit assignment */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false }}
        transition={{ delay: 0.6, duration: 0.4 }}
        className="mb-3 grid grid-cols-2 gap-2"
      >
        <div>
          <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
            Debit
          </label>
          <div className="rounded-lg border border-emerald-300 bg-emerald-50/50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/30">
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              6200 &middot; Software
            </span>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
            Credit
          </label>
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <span className="text-xs font-semibold text-foreground">
              1000 &middot; Cash
            </span>
          </div>
        </div>
      </motion.div>

      {/* Balanced indicator */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: false }}
        transition={{ delay: 0.75, duration: 0.35 }}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 py-1.5 dark:bg-emerald-950/40"
      >
        <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
          Balanced · $2,450.00
        </span>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 3: Insights — Real mini dashboard with KPIs + chart           */
/* ------------------------------------------------------------------ */

const kpis = [
  {
    label: "Revenue",
    value: "$84.2k",
    change: "+12.4%",
    trend: "up" as const,
    icon: DollarSign,
  },
  {
    label: "Expenses",
    value: "$41.8k",
    change: "+3.1%",
    trend: "up" as const,
    icon: BarChart3,
  },
  {
    label: "Margin",
    value: "50.3%",
    change: "+4.2%",
    trend: "up" as const,
    icon: Percent,
  },
];

const chartBars = [
  { month: "Sep", revenue: 58, expense: 34 },
  { month: "Oct", revenue: 72, expense: 38 },
  { month: "Nov", revenue: 65, expense: 36 },
  { month: "Dec", revenue: 80, expense: 41 },
  { month: "Jan", revenue: 76, expense: 39 },
  { month: "Feb", revenue: 84, expense: 42 },
];

function InsightsVisual() {
  return (
    <div className="rounded-xl rounded-b-none bg-card p-4">
      {/* Dashboard header */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: false }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="mb-3 flex items-center justify-between"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Overview
        </span>
        <span className="rounded-md border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
          Last 6 months
        </span>
      </motion.div>

      {/* KPI boxes */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false }}
            transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
            className="rounded-lg border border-border bg-card px-2.5 py-2"
          >
            <div className="mb-1 flex items-center gap-1">
              <kpi.icon className="size-2.5 text-muted-foreground" />
              <span className="text-[9px] font-medium text-muted-foreground">
                {kpi.label}
              </span>
            </div>
            <p className="text-sm font-bold tabular-nums text-foreground leading-none">
              {kpi.value}
            </p>
            <div className="mt-1 flex items-center gap-0.5">
              {kpi.trend === "up" ? (
                <TrendingUp className="size-2.5 text-emerald-500" />
              ) : (
                <TrendingDown className="size-2.5 text-rose-500" />
              )}
              <span
                className={cn(
                  "text-[9px] font-semibold",
                  kpi.trend === "up"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-500"
                )}
              >
                {kpi.change}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Mini bar chart */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false }}
        transition={{ delay: 0.65, duration: 0.4 }}
        className="rounded-lg border border-border bg-card p-3"
      >
        <div className="mb-2 flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="size-1.5 rounded-full bg-emerald-500" />
            <span className="text-[9px] text-muted-foreground">Revenue</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="size-1.5 rounded-full bg-rose-400" />
            <span className="text-[9px] text-muted-foreground">Expenses</span>
          </div>
        </div>

        {/* Chart area */}
        <div className="flex items-end gap-1.5 h-16">
          {chartBars.map((bar, i) => (
            <div key={bar.month} className="flex flex-1 flex-col items-center gap-0.5">
              <div className="flex w-full items-end justify-center gap-px h-12">
                {/* Revenue bar */}
                <motion.div
                  initial={{ height: 0 }}
                  whileInView={{ height: `${(bar.revenue / 84) * 100}%` }}
                  viewport={{ once: false }}
                  transition={{
                    delay: 0.8 + i * 0.08,
                    duration: 0.5,
                    ease: "easeOut",
                  }}
                  className="w-[5px] rounded-t-sm bg-emerald-500"
                />
                {/* Expense bar */}
                <motion.div
                  initial={{ height: 0 }}
                  whileInView={{ height: `${(bar.expense / 84) * 100}%` }}
                  viewport={{ once: false }}
                  transition={{
                    delay: 0.85 + i * 0.08,
                    duration: 0.5,
                    ease: "easeOut",
                  }}
                  className="w-[5px] rounded-t-sm bg-rose-400"
                />
              </div>
              <span className="text-[8px] text-muted-foreground">{bar.month}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Steps data                                                        */
/* ------------------------------------------------------------------ */

const steps = [
  {
    step: 1,
    title: "Connect",
    subtitle: "Link your banks, payment processors, and accounting tools in one click.",
    visual: <ConnectVisual />,
  },
  {
    step: 2,
    title: "Categorize",
    subtitle: "Classify every transaction with smart double-entry bookkeeping.",
    visual: <CategorizeVisual />,
  },
  {
    step: 3,
    title: "Insights",
    subtitle: "See your finances clearly with real-time dashboards and reports.",
    visual: <InsightsVisual />,
  },
];

/* ------------------------------------------------------------------ */
/*  Dashed connector SVG                                              */
/* ------------------------------------------------------------------ */

function DashedConnectors() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-[140px] hidden md:block"
      aria-hidden="true"
    >
      <svg className="absolute inset-x-0 top-0 h-px w-full" preserveAspectRatio="none">
        <line
          x1="16.666%"
          y1="0"
          x2="83.333%"
          y2="0"
          stroke="currentColor"
          className="text-emerald-300 dark:text-emerald-800"
          strokeWidth="2"
          strokeDasharray="8 6"
        />
      </svg>

      {/* Arrow circles at connection points */}
      {[33.333, 66.666].map((pct) => (
        <div
          key={pct}
          className="absolute top-0 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          style={{ left: `${pct}%` }}
        >
          <div className="flex size-7 items-center justify-center rounded-full border-2 border-dashed border-emerald-300 bg-background dark:border-emerald-800">
            <ArrowRight className="size-3 text-emerald-500 dark:text-emerald-400" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export                                                       */
/* ------------------------------------------------------------------ */

export function HowItWorks() {
  return (
    <section className="py-16 md:py-20">
      <Container>
        <SectionHeader
          badge="How it works"
          title="Three steps to clarity"
          subtitle="From connection to insight in minutes, not months."
        />

        <div className="relative grid grid-cols-1 gap-6 md:grid-cols-3">
          <DashedConnectors />

          {steps.map((item, i) => (
            <ScrollReveal key={item.step} delay={i * 0.12}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="relative flex h-full flex-col rounded-2xl border border-border bg-card transition-colors hover:border-emerald-300/50 dark:hover:border-emerald-700/50"
              >
                {/* Visual mockup area */}
                <div className="relative overflow-hidden rounded-t-2xl p-4 pb-0">
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
                  <div className="relative">{item.visual}</div>
                </div>

                {/* Text content */}
                <div className="flex flex-1 flex-col p-5 pt-4">
                  {/* Step badge */}
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex size-6 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                      {item.step}
                    </div>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <h3 className="text-lg font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {item.subtitle}
                  </p>
                </div>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

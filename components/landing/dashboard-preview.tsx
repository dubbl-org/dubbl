"use client";

import { motion } from "motion/react";
import { Container } from "@/components/shared/container";
import { SectionHeader } from "@/components/shared/section-header";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  KPI Sparkline — tiny inline chart                                  */
/* ------------------------------------------------------------------ */

function Sparkline({ trend }: { trend: "up" | "down" | "stable" }) {
  const paths = {
    up: "M0,16 L6,14 L12,15 L18,11 L24,9 L30,10 L36,6 L42,3",
    down: "M0,4 L6,6 L12,5 L18,9 L24,11 L30,10 L36,13 L42,16",
    stable: "M0,10 L6,9 L12,11 L18,10 L24,9 L30,10 L36,9 L42,10",
  };

  return (
    <svg viewBox="0 0 42 20" className="h-5 w-10" fill="none">
      <motion.path
        d={paths[trend]}
        className={cn(
          "fill-none stroke-2",
          trend === "up" && "stroke-emerald-500",
          trend === "down" && "stroke-red-400",
          trend === "stable" && "stroke-muted-foreground/40"
        )}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: false }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const kpis = [
  { label: "Revenue", value: "$84,200", change: "+12.5%", up: true, trend: "up" as const },
  { label: "Expenses", value: "$41,800", change: "+3.2%", up: false, trend: "up" as const },
  { label: "Net Profit", value: "$42,400", change: "+18.7%", up: true, trend: "up" as const },
  { label: "Cash Balance", value: "$48,250", change: "+2.1%", up: true, trend: "stable" as const },
];

const transactions = [
  { date: "Mar 01", desc: "Client Invoice #1024", amount: "+$12,500", type: "income" },
  { date: "Feb 28", desc: "Office Rent — Q1", amount: "-$3,200", type: "expense" },
  { date: "Feb 27", desc: "Software Subscription", amount: "-$299", type: "expense" },
  { date: "Feb 26", desc: "Consulting Revenue", amount: "+$8,000", type: "income" },
  { date: "Feb 25", desc: "Equipment Purchase", amount: "-$1,450", type: "expense" },
];

const linePoints = [
  [0, 78], [30, 72], [60, 68], [90, 72], [120, 60],
  [150, 52], [180, 56], [210, 44], [240, 38], [270, 32],
  [300, 28], [330, 22], [360, 18],
] as const;

const accountSegments = [
  { label: "Assets", pct: 60, color: "bg-emerald-500" },
  { label: "Liabilities", pct: 17, color: "bg-red-400" },
  { label: "Equity", pct: 23, color: "bg-blue-500" },
];

/* ------------------------------------------------------------------ */
/*  Main Section                                                       */
/* ------------------------------------------------------------------ */

export function DashboardPreview() {
  const chartPolyline = linePoints.map(([x, y]) => `${x},${y}`).join(" ");
  const areaPolygon = `0,100 ${chartPolyline} 360,100`;

  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      {/* Subtle background wash */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-muted/30 via-muted/10 to-transparent" />

      <Container className="relative">
        <SectionHeader
          badge="Product"
          title="Your finances at a glance"
          subtitle="A real-time dashboard for your finances, projects, inventory, and team - all in one place."
        />

        <ScrollReveal>
          <motion.div
            className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/[0.08] dark:shadow-black/40"
            initial={{ y: 40, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: false, margin: "-60px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="p-5 md:p-8">
              {/* KPI Row */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {kpis.map((kpi, i) => (
                  <motion.div
                    key={kpi.label}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: false }}
                    transition={{ duration: 0.35, delay: i * 0.07 }}
                    className="rounded-xl border border-border bg-background p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {kpi.label}
                      </p>
                      <Sparkline trend={kpi.trend} />
                    </div>
                    <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-foreground">
                      {kpi.value}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {kpi.up ? (
                        <TrendingUp className="size-3 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <TrendingDown className="size-3 text-red-500 dark:text-red-400" />
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
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Chart + Transactions */}
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                {/* Area chart */}
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: false }}
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
                    className="h-36 w-full"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="dashAreaGrad" x1="0" y1="0" x2="0" y2="1">
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
                    {[20, 40, 60, 80].map((y) => (
                      <line
                        key={y}
                        x1="0" y1={y} x2="360" y2={y}
                        className="stroke-border"
                        strokeWidth="0.5"
                        strokeDasharray="4 4"
                      />
                    ))}
                    <motion.polygon
                      points={areaPolygon}
                      fill="url(#dashAreaGrad)"
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: false }}
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
                      whileInView={{ pathLength: 1 }}
                      viewport={{ once: false }}
                      transition={{ duration: 1.6, ease: "easeOut" }}
                    />
                    {linePoints.map(([x, y], i) => (
                      <motion.circle
                        key={i}
                        cx={x} cy={y} r="2.5"
                        className="fill-emerald-500"
                        initial={{ opacity: 0, scale: 0 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: false }}
                        transition={{ duration: 0.2, delay: 0.8 + i * 0.06 }}
                      />
                    ))}
                  </svg>
                </motion.div>

                {/* Transactions list */}
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: false }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="rounded-xl border border-border bg-background p-5"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Recent Transactions
                    </p>
                    <span className="rounded-md bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Last 7 days
                    </span>
                  </div>
                  <div className="space-y-0">
                    {transactions.map((tx, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: false }}
                        transition={{ duration: 0.3, delay: 0.5 + i * 0.06 }}
                        className="flex items-center justify-between border-b border-border/50 py-3 last:border-0"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-mono text-muted-foreground w-12 shrink-0">
                            {tx.date}
                          </span>
                          <span className="text-sm text-foreground">
                            {tx.desc}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            tx.type === "income"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-foreground"
                          )}
                        >
                          {tx.amount}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </div>

              {/* Account breakdown bar */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="mt-5 rounded-xl border border-border bg-background p-5"
              >
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Account Breakdown
                </p>
                <div className="flex h-3 overflow-hidden rounded-full">
                  {accountSegments.map((seg) => (
                    <motion.div
                      key={seg.label}
                      className={cn("h-full first:rounded-l-full last:rounded-r-full", seg.color)}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${seg.pct}%` }}
                      viewport={{ once: false }}
                      transition={{ duration: 0.8, ease: "easeOut", delay: 0.6 }}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
                  {accountSegments.map((seg) => (
                    <div key={seg.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={cn("inline-block size-2 rounded-full", seg.color)} />
                      {seg.label} {seg.pct}%
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </motion.div>
        </ScrollReveal>
      </Container>
    </section>
  );
}

"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  FileSpreadsheet,
  Clock,
  FileQuestion,
  Download,
} from "lucide-react";
import { Container } from "@/components/shared/container";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Problem Cards — realistic mockup internals                                */
/* -------------------------------------------------------------------------- */

function SpreadsheetMockup() {
  const rows = [
    { a: "Q1 Revenue", b: "$142,500", c: "$138,200", highlight: false },
    { a: "Q2 Revenue", b: "$156,800", c: "#REF!", highlight: true },
    { a: "Q3 Revenue", b: "$—", c: "$161,400", highlight: false },
    { a: "Q4 Revenue", b: "$178,300", c: "$174,900", highlight: false },
  ];

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border bg-muted/40">
      {/* Column headers */}
      <div className="grid grid-cols-3 border-b border-border bg-muted/60 text-[10px] font-semibold text-muted-foreground">
        <div className="border-r border-border px-3 py-1.5">Category</div>
        <div className="border-r border-border px-3 py-1.5">Projected</div>
        <div className="px-3 py-1.5">Actual</div>
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className={cn(
            "grid grid-cols-3 text-[10px]",
            i < rows.length - 1 && "border-b border-border"
          )}
        >
          <div className="border-r border-border px-3 py-1.5 text-muted-foreground">
            {row.a}
          </div>
          <div className="border-r border-border px-3 py-1.5 text-foreground">
            {row.b === "$—" ? (
              <span className="text-muted-foreground/50">$—</span>
            ) : (
              row.b
            )}
          </div>
          <div
            className={cn(
              "px-3 py-1.5",
              row.highlight
                ? "bg-red-500/10 font-semibold text-red-600 dark:text-red-400"
                : "text-foreground"
            )}
          >
            {row.highlight && (
              <span className="mr-1 inline-block size-1.5 rounded-full bg-red-500" />
            )}
            {row.c}
          </div>
        </div>
      ))}
    </div>
  );
}

function BankTimelineMockup() {
  const events = [
    { label: "ACH Transfer — Payroll", status: "success", time: "2 days ago" },
    { label: "Wire — Vendor #4092", status: "failed", time: "3 days ago" },
    { label: "Direct Debit — Office Lease", status: "delayed", time: "5 days ago" },
    { label: "Card Payment — SaaS Sub", status: "success", time: "6 days ago" },
  ];

  const statusStyles: Record<string, { dot: string; text: string; label: string }> = {
    success: {
      dot: "bg-emerald-500",
      text: "text-muted-foreground",
      label: "Synced",
    },
    failed: {
      dot: "bg-red-500",
      text: "text-red-600 dark:text-red-400",
      label: "Failed",
    },
    delayed: {
      dot: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
      label: "Delayed",
    },
  };

  return (
    <div className="mt-4 space-y-0">
      {events.map((ev, i) => {
        const s = statusStyles[ev.status];
        return (
          <div key={i} className="flex items-start gap-3 py-2">
            {/* Timeline rail */}
            <div className="flex flex-col items-center pt-1">
              <span className={cn("size-2 rounded-full", s.dot)} />
              {i < events.length - 1 && (
                <span className="mt-1 h-5 w-px bg-border" />
              )}
            </div>
            {/* Content */}
            <div className="flex flex-1 items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium text-foreground leading-tight">
                  {ev.label}
                </p>
                <p className="text-[10px] text-muted-foreground">{ev.time}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold",
                  ev.status === "success" &&
                    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
                  ev.status === "failed" &&
                    "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
                  ev.status === "delayed" &&
                    "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                )}
              >
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MissingRecordsMockup() {
  const rows = [
    { id: "INV-1041", vendor: "Acme Corp", amount: "$3,200", status: "ok" },
    { id: "INV-1042", vendor: "—", amount: "—", status: "missing" },
    { id: "INV-1043", vendor: "Globex Inc", amount: "$890", status: "ok" },
    { id: "INV-1044", vendor: "—", amount: "$1,475", status: "partial" },
  ];

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border bg-muted/40">
      <div className="grid grid-cols-4 border-b border-border bg-muted/60 text-[10px] font-semibold text-muted-foreground">
        <div className="border-r border-border px-3 py-1.5">Invoice</div>
        <div className="border-r border-border px-3 py-1.5">Vendor</div>
        <div className="border-r border-border px-3 py-1.5">Amount</div>
        <div className="px-3 py-1.5">Status</div>
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className={cn(
            "grid grid-cols-4 text-[10px]",
            i < rows.length - 1 && "border-b border-border",
            row.status !== "ok" && "bg-amber-500/5"
          )}
        >
          <div className="border-r border-border px-3 py-1.5 font-mono text-foreground">
            {row.id}
          </div>
          <div
            className={cn(
              "border-r border-border px-3 py-1.5",
              row.vendor === "—"
                ? "text-muted-foreground/40"
                : "text-foreground"
            )}
          >
            {row.vendor}
          </div>
          <div
            className={cn(
              "border-r border-border px-3 py-1.5",
              row.amount === "—"
                ? "text-muted-foreground/40"
                : "text-foreground"
            )}
          >
            {row.amount}
          </div>
          <div className="px-3 py-1.5">
            {row.status === "ok" ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                Complete
              </span>
            ) : row.status === "missing" ? (
              <span className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                <AlertTriangle className="size-2.5" />
                Missing
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-2.5" />
                Partial
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Problem Section                                                           */
/* -------------------------------------------------------------------------- */

function ProblemSection() {
  const cards = [
    {
      icon: FileSpreadsheet,
      title: "Spreadsheet errors",
      description:
        "Copy-paste mistakes and broken formulas silently corrupt your data across dozens of tabs.",
      mockup: <SpreadsheetMockup />,
    },
    {
      icon: Clock,
      title: "Delayed bank data",
      description:
        "Statements arrive days late. Reconciliation is always lagging behind reality.",
      mockup: <BankTimelineMockup />,
    },
    {
      icon: FileQuestion,
      title: "Missing records",
      description:
        "Gaps in vendor data, lost invoices, and unknown line items make reporting unreliable.",
      mockup: <MissingRecordsMockup />,
    },
  ];

  return (
    <section className="py-16 md:py-20">
      <Container>
        <ScrollReveal>
          <div className="mb-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-sm font-medium text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
              <span className="inline-block size-1.5 rounded-full bg-red-500" />
              The Problem
            </span>
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
            You&apos;re making decisions on{" "}
            <span className="text-red-600 dark:text-red-400">
              incomplete financial data
            </span>
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Messy spreadsheets. Manual reconciliation. Scattered tools that
            never talk to each other. Your financial data is spread across
            dozens of disconnected sources, and by the time you piece it
            together the numbers are already stale.
          </p>
        </ScrollReveal>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {cards.map((card, i) => (
            <ScrollReveal key={card.title} delay={0.1 + i * 0.1}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="group flex h-full flex-col rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-950/40">
                    <card.icon className="size-4 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {card.title}
                  </h3>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {card.description}
                </p>
                <div className="relative overflow-hidden rounded-lg">
                  <div className="blueprint-hash pointer-events-none absolute inset-0" />
                  <div className="relative">{card.mockup}</div>
                </div>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Solution Dashboard                                                        */
/* -------------------------------------------------------------------------- */

function SolutionDashboard() {
  const [activeTab, setActiveTab] = useState("Revenue");
  const tabs = ["Revenue", "Expenses", "Cash Flow"];

  const barHeights: Record<string, number[]> = {
    Revenue: [40, 65, 55, 80, 70, 90, 75, 85, 95, 60, 78, 88],
    Expenses: [55, 48, 62, 45, 50, 38, 58, 42, 35, 52, 46, 40],
    "Cash Flow": [30, 50, 42, 68, 58, 78, 62, 74, 82, 48, 65, 76],
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-950 p-px shadow-2xl ring-1 ring-emerald-500/20">
      <div className="rounded-[15px] bg-emerald-950/80 backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-emerald-800/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/20">
              <span className="text-sm font-bold text-emerald-400">d</span>
            </div>
            <span className="text-sm font-semibold text-emerald-100">
              dubbl Engine
            </span>
          </div>
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="size-2 rounded-full bg-emerald-400"
            />
            <span className="text-xs text-emerald-400/80">Live</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-emerald-800/40 px-6 pt-3">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "relative rounded-t-lg px-4 py-2 text-xs font-medium transition-colors",
                activeTab === tab
                  ? "bg-emerald-800/50 text-emerald-100"
                  : "text-emerald-500 hover:text-emerald-300"
              )}
            >
              {tab}
              {activeTab === tab && (
                <motion.div
                  layoutId="solutionActiveTab"
                  className="absolute inset-x-0 -bottom-px h-px bg-emerald-400"
                />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 md:p-8">
          {/* Stats row */}
          <div className="mb-8 grid grid-cols-3 gap-4 md:gap-6">
            <div className="rounded-xl border border-emerald-800/30 bg-emerald-900/40 p-4 md:p-5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-emerald-500 md:text-xs">
                Processed
              </div>
              <div className="mt-1.5 text-xl font-bold text-emerald-100 md:text-2xl">
                <AnimatedCounter
                  target={384585}
                  suffix=""
                  className="text-emerald-100"
                />
              </div>
              <div className="mt-0.5 text-[10px] text-emerald-600 md:text-xs">transactions</div>
            </div>
            <div className="rounded-xl border border-emerald-800/30 bg-emerald-900/40 p-4 md:p-5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-emerald-500 md:text-xs">
                Accuracy
              </div>
              <div className="mt-1.5 text-xl font-bold text-emerald-100 md:text-2xl">
                <AnimatedCounter
                  target={99}
                  suffix="%"
                  className="text-emerald-100"
                />
              </div>
              <div className="mt-0.5 text-[10px] text-emerald-600 md:text-xs">match rate</div>
            </div>
            <div className="rounded-xl border border-emerald-800/30 bg-emerald-900/40 p-4 md:p-5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-emerald-500 md:text-xs">
                Sources
              </div>
              <div className="mt-1.5 text-xl font-bold text-emerald-100 md:text-2xl">
                <AnimatedCounter target={24} className="text-emerald-100" />
              </div>
              <div className="mt-0.5 text-[10px] text-emerald-600 md:text-xs">connected</div>
            </div>
          </div>

          {/* Chart */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-500">
              Monthly trend
            </span>
            <span className="text-xs text-emerald-600">
              Jan — Dec 2025
            </span>
          </div>
          <div
            className="mb-8 flex items-end gap-2 rounded-xl border border-emerald-800/20 bg-emerald-900/20 p-4"
            style={{ height: 200 }}
          >
            {(barHeights[activeTab] ?? barHeights["Revenue"]).map((h, i) => (
              <motion.div
                key={`${activeTab}-${i}`}
                className="flex-1 rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-400"
                initial={{ height: 0 }}
                whileInView={{ height: `${h}%` }}
                viewport={{ once: false }}
                transition={{ duration: 0.5, delay: i * 0.04 }}
              />
            ))}
          </div>

          {/* Export row */}
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-600">
              Export
            </span>
            <div className="flex gap-3">
              <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-800/60 bg-emerald-900/40 px-4 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-800/40">
                <ArrowRight className="size-3.5" />
                API
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-800/60 bg-emerald-900/40 px-4 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-800/40">
                <Download className="size-3.5" />
                CSV / XLS
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Solution Section                                                          */
/* -------------------------------------------------------------------------- */

function SolutionSection() {
  return (
    <section className="relative overflow-hidden bg-muted/20 py-16 md:py-20">
      <div className="blueprint-hash pointer-events-none absolute inset-0" />
      <Container className="relative">
        <ScrollReveal>
          <div className="mb-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
              <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
              The Solution
            </span>
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
            One unified view of{" "}
            <span className="text-emerald-600 dark:text-emerald-400">
              your entire financial picture
            </span>
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            dubbl unifies every data source into a single, real-time financial
            engine. Automated reconciliation, instant reports, and a
            developer-first API mean you always have the full picture — not a
            patchwork of guesses.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.2}>
          <div className="mt-14">
            <SolutionDashboard />
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stats Row                                                                 */
/* -------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------- */
/*  Export                                                                     */
/* -------------------------------------------------------------------------- */

export function FeatureSections() {
  return (
    <>
      <ProblemSection />
      <SolutionSection />
    </>
  );
}

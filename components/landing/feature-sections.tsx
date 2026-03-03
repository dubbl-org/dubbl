"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  FileSpreadsheet,
  Clock,
  FileQuestion,
  Download,
  Check,
  TrendingUp,
  Zap,
  Target,
  Database,
} from "lucide-react";
import { GrainGradient } from "@paper-design/shaders-react";
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
    <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
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
            {row.highlight ? (
              <motion.span
                className="inline-flex items-center gap-1"
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <span className="inline-block size-1.5 rounded-full bg-red-500" />
                {row.c}
              </motion.span>
            ) : (
              row.c
            )}
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

  const statusStyles: Record<string, { dot: string; label: string }> = {
    success: { dot: "bg-emerald-500", label: "Synced" },
    failed: { dot: "bg-red-500", label: "Failed" },
    delayed: { dot: "bg-amber-500", label: "Delayed" },
  };

  return (
    <div className="space-y-0">
      {events.map((ev, i) => {
        const s = statusStyles[ev.status];
        return (
          <div key={i} className="flex items-start gap-3 py-2">
            <div className="flex flex-col items-center pt-1">
              <span className={cn("size-2 rounded-full", s.dot)} />
              {i < events.length - 1 && (
                <span className="mt-1 h-5 w-px bg-border" />
              )}
            </div>
            <div className="flex flex-1 items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium leading-tight text-foreground">
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
    <div className="relative overflow-hidden rounded-lg border border-border bg-muted/40">
      {/* Scan line animation */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent"
        animate={{ top: ["0%", "100%", "0%"] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
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
              row.vendor === "—" ? "text-muted-foreground/40" : "text-foreground"
            )}
          >
            {row.vendor}
          </div>
          <div
            className={cn(
              "border-r border-border px-3 py-1.5",
              row.amount === "—" ? "text-muted-foreground/40" : "text-foreground"
            )}
          >
            {row.amount}
          </div>
          <div className="px-3 py-1.5">
            {row.status === "ok" ? (
              <span className="text-emerald-600 dark:text-emerald-400">Complete</span>
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
  return (
    <section className="py-16 md:py-20">
      <Container>
        {/* Header band with grain gradient */}
        <ScrollReveal>
          <div className="relative overflow-hidden rounded-2xl border border-red-400/30 p-8 dark:border-red-500/20 md:p-12">
            <GrainGradient
              className="pointer-events-none !absolute !inset-0 !rounded-none"
              width="100%"
              height="100%"
              colors={["#fecaca", "#fca5a5", "#fb7185", "#f87171", "#ef4444", "#f87171", "#fca5a5"]}
              colorBack="#f87171"
              softness={1}
              intensity={0.8}
              noise={0.9}
              shape="wave"
              scale={3.5}
              speed={0.2}
            />
            <div className="relative">
              <div className="mb-5">
                <span className="inline-flex items-center gap-2 rounded-full border border-red-300/60 bg-red-900/30 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
                  <span className="inline-block size-1.5 rounded-full bg-red-300" />
                  The Problem
                </span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
                You&apos;re making decisions on{" "}
                <span className="text-red-950">
                  incomplete financial data
                </span>
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-red-100">
                Messy spreadsheets. Manual reconciliation. Scattered tools that
                never talk to each other. Your financial data is spread across
                dozens of disconnected sources.
              </p>
            </div>
          </div>
        </ScrollReveal>

        {/* Asymmetric card grid */}
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {/* Hero card — spans 2 columns, landscape layout */}
          <ScrollReveal delay={0.1} className="md:col-span-2">
            <motion.div
              whileHover={{ y: -6, scale: 1.005 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card md:flex-row"
            >
              {/* Red warning pulse */}
              <motion.div
                className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-red-500 to-transparent"
                animate={{ opacity: [0, 0.6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
              {/* Left: mockup with grain gradient */}
              <div className="relative overflow-hidden border-b border-border p-4 md:w-3/5 md:border-b-0 md:border-r md:p-6">
                <GrainGradient
                  className="pointer-events-none !absolute !inset-0 !rounded-none"
                  width="100%"
                  height="100%"
                  colors={["#fecaca", "#fca5a5", "#fb7185", "#f87171", "#ef4444", "#f87171", "#fca5a5"]}
                  colorBack="#f87171"
                  softness={1}
                  intensity={0.8}
                  noise={0.7}
                  shape="wave"
                  scale={3.5}
                  speed={0.2}
                />
                <div className="relative">
                  <SpreadsheetMockup />
                </div>
              </div>
              {/* Right: text */}
              <div className="flex flex-1 flex-col justify-center p-5 md:p-8">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-950/40">
                    <FileSpreadsheet className="size-4 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">
                    Spreadsheet errors
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Copy-paste mistakes and broken formulas silently corrupt your
                  data across dozens of tabs.
                </p>
                <div className="mt-5 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/30">
                  <AnimatedCounter
                    target={67}
                    suffix="%"
                    className="text-2xl font-bold text-red-600 dark:text-red-400"
                  />
                  <span className="text-xs text-muted-foreground">
                    of spreadsheets contain formula errors
                  </span>
                </div>
              </div>
            </motion.div>
          </ScrollReveal>

          {/* Right column — two stacked cards */}
          <div className="flex flex-col gap-5">
            {/* Delayed bank data */}
            <ScrollReveal delay={0.2}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card"
              >
                <motion.div
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-red-500 to-transparent"
                  animate={{ opacity: [0, 0.6, 0] }}
                  transition={{ duration: 3, delay: 1, repeat: Infinity, ease: "easeInOut" }}
                />
                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-950/40">
                      <Clock className="size-4 text-red-600 dark:text-red-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Delayed bank data
                    </h3>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Statements arrive days late. Reconciliation is always
                    lagging behind reality.
                  </p>
                  <BankTimelineMockup />
                </div>
              </motion.div>
            </ScrollReveal>

            {/* Missing records */}
            <ScrollReveal delay={0.3}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card"
              >
                <motion.div
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-red-500 to-transparent"
                  animate={{ opacity: [0, 0.6, 0] }}
                  transition={{ duration: 3, delay: 2, repeat: Infinity, ease: "easeInOut" }}
                />
                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-950/40">
                      <FileQuestion className="size-4 text-red-600 dark:text-red-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Missing records
                    </h3>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Gaps in vendor data, lost invoices, and unknown line items
                    make reporting unreliable.
                  </p>
                  <div className="mt-4">
                    <MissingRecordsMockup />
                  </div>
                </div>
              </motion.div>
            </ScrollReveal>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Solution Dashboard                                                        */
/* -------------------------------------------------------------------------- */

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function SolutionDashboard() {
  const [activeTab, setActiveTab] = useState("Revenue");
  const tabs = ["Revenue", "Expenses", "Cash Flow"];

  const barHeights: Record<string, number[]> = {
    Revenue: [40, 65, 55, 80, 70, 90, 75, 85, 95, 60, 78, 88],
    Expenses: [55, 48, 62, 45, 50, 38, 58, 42, 35, 52, 46, 40],
    "Cash Flow": [30, 50, 42, 68, 58, 78, 62, 74, 82, 48, 65, 76],
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-emerald-500/10 ring-1 ring-emerald-500/10">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500">
            <span className="text-sm font-bold text-white">d</span>
          </div>
          <span className="text-sm font-semibold text-foreground">
            dubbl Engine
          </span>
        </div>
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="size-2 rounded-full bg-emerald-500"
          />
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Live sync
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border px-6 py-3">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium transition-all",
              activeTab === tab
                ? "bg-emerald-500 text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6 md:p-8">
        {/* Insights row */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Revenue trend
            </span>
            <div className="mt-1 flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-500" />
              <span className="text-sm font-bold text-foreground">+18.2%</span>
              <span className="text-[10px] text-muted-foreground">
                vs last quarter
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Reconciliation
            </span>
            <div className="mt-1 flex items-center gap-2">
              <Check className="size-4 text-emerald-500" />
              <span className="text-sm font-bold text-foreground">99.7%</span>
              <span className="text-[10px] text-muted-foreground">
                auto-matched
              </span>
            </div>
          </div>
        </div>

        {/* Chart header */}
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Monthly trend
          </span>
          <span className="text-xs text-muted-foreground/60">
            Jan - Dec 2025
          </span>
        </div>

        {/* Chart */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mb-6 flex items-end gap-2 rounded-xl border border-border bg-muted/20 p-4"
            style={{ height: 220 }}
          >
            {(barHeights[activeTab] ?? barHeights["Revenue"]).map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <motion.div
                  className="w-full rounded-t-md bg-gradient-to-t from-emerald-600 to-emerald-400"
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ duration: 0.5, delay: i * 0.04 }}
                />
                <span className="text-[8px] text-muted-foreground">
                  {months[i]}
                </span>
              </div>
            ))}
          </motion.div>
        </AnimatePresence>

        {/* Export row */}
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Export
          </span>
          <div className="flex gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted">
              <ArrowRight className="size-3.5" />
              API
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted">
              <Download className="size-3.5" />
              CSV / XLS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Solution Section                                                          */
/* -------------------------------------------------------------------------- */

const stats = [
  { label: "Transactions Processed", value: 384585, suffix: "+", icon: Zap },
  { label: "Match Accuracy", value: 99.7, suffix: "%", icon: Target },
  { label: "Data Sources", value: 24, suffix: "", icon: Database },
];

function SolutionSection() {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      {/* Full-bleed grain gradient background */}
      <GrainGradient
        className="pointer-events-none !absolute !inset-0 !rounded-none"
        width="100%"
        height="100%"
        colors={["#a7f3d0", "#6ee7b7", "#34d399", "#10b981"]}
        colorBack="#d1fae5"
        softness={0.4}
        intensity={0.5}
        noise={0.7}
        shape="dots"
        speed={0.3}
      />
      {/* Dark mode wash */}
      <div className="pointer-events-none absolute inset-0 bg-background/80 dark:bg-background/90" />
      {/* Top/bottom fades */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />

      <Container className="relative">
        {/* Header card with its own grain gradient */}
        <ScrollReveal>
          <div className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl border border-emerald-200/50 p-8 text-center dark:border-emerald-800/30 md:p-12">
            <GrainGradient
              className="pointer-events-none !absolute !inset-0 !rounded-none"
              width="100%"
              height="100%"
              colors={["#a7f3d0", "#6ee7b7", "#34d399", "#10b981"]}
              colorBack="#d1fae5"
              softness={0.3}
              intensity={0.6}
              noise={0.7}
              shape="dots"
              speed={0.3}
            />
            <div className="pointer-events-none absolute inset-0 bg-background/65 dark:bg-background/85" />
            <div className="relative">
              <div className="mb-5 flex justify-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                  The Solution
                </span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
                One unified view of{" "}
                <span className="text-emerald-600 dark:text-emerald-400">
                  your entire financial picture
                </span>
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
                dubbl unifies every data source into a single, real-time
                financial engine. Automated reconciliation, instant reports,
                and a developer-first API.
              </p>
            </div>
          </div>
        </ScrollReveal>

        {/* Floating stat pills */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {stats.map((stat, i) => (
            <ScrollReveal key={stat.label} delay={0.1 + i * 0.1}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="flex items-center gap-4 rounded-xl border border-emerald-200/50 bg-card/80 p-4 backdrop-blur-sm dark:border-emerald-800/30 dark:bg-card/60"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/50">
                  <stat.icon className="size-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {stat.label}
                  </div>
                </div>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>

        {/* Dashboard with entrance animation */}
        <ScrollReveal delay={0.2}>
          <div className="mt-14" style={{ perspective: 1200 }}>
            <motion.div
              initial={{ y: 40, opacity: 0, rotateX: 4 }}
              whileInView={{ y: 0, opacity: 1, rotateX: 0 }}
              viewport={{ once: false, margin: "-100px" }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <SolutionDashboard />
            </motion.div>
          </div>
        </ScrollReveal>

        {/* Bottom trust signals */}
        <ScrollReveal delay={0.3}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {[
              "Real-time sync",
              "Bank-grade encryption",
              "Unlimited data sources",
              "API-first",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Check className="size-4 text-emerald-500" />
                {item}
              </div>
            ))}
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}

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

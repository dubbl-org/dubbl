"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  Clock,
  FileQuestion,
  Check,
  FileText,
  Building2,
  Globe,
} from "lucide-react";
import { GrainGradient } from "@paper-design/shaders-react";
import { Container } from "@/components/shared/container";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Problem Cards — realistic mockup internals                                */
/* -------------------------------------------------------------------------- */



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
                You&apos;re managing your business across{" "}
                <span className="text-red-950">
                  too many disconnected tools
                </span>
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-red-100">
                Separate tools for accounting, project tracking, inventory,
                payroll, and CRM. Context switching kills productivity and data
                never lines up.
              </p>
            </div>
          </div>
        </ScrollReveal>

        {/* Asymmetric card grid */}
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {/* Hero card — spans 2 columns, full grain gradient bg */}
          <ScrollReveal delay={0.1} className="md:col-span-2">
            <motion.div
              whileHover={{ y: -6, scale: 1.005 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-red-400/30 dark:border-red-500/20"
            >
              {/* Full card grain gradient background */}
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
              {/* Broken spreadsheet grid filling the entire card */}
              <div className="relative flex-1">
                {/* Grid of cells — fills naturally */}
                <div className="grid auto-rows-fr grid-cols-6 md:grid-cols-8">
                  {[
                    "$142,500", "#REF!", "$—", "MISMATCH", "$156,800", "#N/A", "$178,300", "#VALUE!",
                    "$—", "$138,200", "#DIV/0!", "$161,400", "#NULL!", "$174,900", "ERR:502", "$—",
                    "#NAME?", "$89,200", "$—", "$3,200", "CONFLICT", "#SPILL!", "$45,100", "NaN",
                    "$—", "#REF!", "$67,800", "MISSING", "$—", "#ERROR!", "$12,350", "$—",
                    "$92,100", "DUPLICATE", "$—", "#N/A", "$55,670", "$—", "TIMEOUT", "$78,400",
                    "#VALUE!", "$—", "$34,500", "OVERWRITE", "$—", "#REF!", "$—", "$23,100",
                    "$67,200", "#SPILL!", "$—", "$44,800", "#REF!", "$—", "MISMATCH", "$91,300",
                    "$—", "$15,700", "#NAME?", "$—", "$82,400", "NaN", "$—", "#NULL!",
                    "#ERROR!", "$—", "$56,100", "CONFLICT", "$—", "$73,200", "#DIV/0!", "$—",
                    "$—", "$28,900", "$—", "#VALUE!", "$48,600", "MISSING", "$—", "ERR:502",
                    "$33,700", "#REF!", "TIMEOUT", "$—", "$61,500", "$—", "#N/A", "DUPLICATE",
                    "$—", "$77,400", "$—", "#SPILL!", "$—", "OVERWRITE", "$19,800", "$—",
                    "$41,200", "#NULL!", "$—", "$88,300", "#REF!", "NaN", "$—", "#VALUE!",
                    "$—", "MISSING", "$52,900", "$—", "#NAME?", "$—", "$66,700", "CONFLICT",
                    "#DIV/0!", "$—", "$71,800", "#SPILL!", "$—", "$95,200", "$—", "#ERROR!",
                    "$—", "$36,400", "DUPLICATE", "$—", "TIMEOUT", "$—", "#REF!", "$43,500",
                    "$84,600", "$—", "#N/A", "$—", "MISMATCH", "$57,300", "$—", "#NULL!",
                    "$—", "OVERWRITE", "$—", "#VALUE!", "$—", "$68,900", "ERR:502", "$—",
                  ].map((cell, i) => {
                    const isError = cell.startsWith("#") || ["MISMATCH", "MISSING", "CONFLICT", "DUPLICATE", "TIMEOUT", "OVERWRITE", "NaN", "ERR:502"].includes(cell);
                    const isEmpty = cell === "$—";
                    return (
                      <div
                        key={i}
                        className={cn(
                          "border-b border-r border-white/10 px-2 py-2 text-[9px] font-mono md:px-3 md:py-2.5 md:text-[10px]",
                          isError && "bg-white/10 font-bold text-white",
                          isEmpty && "text-white/30",
                          !isError && !isEmpty && "text-white/60"
                        )}
                      >
                        {isError ? (
                          <motion.span
                            animate={{ opacity: [1, 0.4, 1] }}
                            transition={{ duration: 2 + (i % 3), delay: (i % 5) * 0.4, repeat: Infinity, ease: "easeInOut" }}
                          >
                            {cell}
                          </motion.span>
                        ) : (
                          cell
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Overlay content card */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="pointer-events-auto mx-4 max-w-lg rounded-2xl border border-red-200/40 bg-white/80 p-6 shadow-2xl shadow-red-500/10 backdrop-blur-xl dark:border-red-400/20 dark:bg-card/80 md:p-8">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-950/50">
                        <AlertTriangle className="size-5 text-red-600 dark:text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">
                          Spreadsheet errors
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Silently corrupting your data
                        </p>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Copy-paste mistakes, broken formulas, and missing references
                      silently corrupt your data across dozens of tabs.
                    </p>
                    <div className="mt-5 flex gap-3">
                      <div className="flex-1 rounded-lg border border-red-200 bg-red-50 p-3 text-center dark:border-red-900/40 dark:bg-red-950/30">
                        <AnimatedCounter
                          target={67}
                          suffix="%"
                          className="text-2xl font-bold text-red-600 dark:text-red-400"
                        />
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          contain errors
                        </p>
                      </div>
                      <div className="flex-1 rounded-lg border border-red-200 bg-red-50 p-3 text-center dark:border-red-900/40 dark:bg-red-950/30">
                        <AnimatedCounter
                          target={42}
                          suffix="hrs"
                          className="text-2xl font-bold text-red-600 dark:text-red-400"
                        />
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          wasted / month
                        </p>
                      </div>
                      <div className="flex-1 rounded-lg border border-red-200 bg-red-50 p-3 text-center dark:border-red-900/40 dark:bg-red-950/30">
                        <AnimatedCounter
                          target={23}
                          className="text-2xl font-bold text-red-600 dark:text-red-400"
                        />
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          errors found
                        </p>
                      </div>
                    </div>
                  </div>
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

/* --- View 0: Animated Marquee Rows --- */
const marqueeConfig: { size: "lg" | "md" | "sm"; pills: string[] }[] = [
  { size: "lg", pills: ["Invoice #2847 — $12,580 sent", "P&L report generated ✓", "Statement imported", "Expense claim approved", "Tax return ready ✓"] },
  { size: "sm", pills: ["Categorized", "Sent", "Paid", "Filed", "Logged", "Synced", "Approved", "Imported", "Auto-tagged", "Booked", "Invoiced", "Tracked"] },
  { size: "md", pills: ["QuickBooks CSV parsed", "Chase CSV parsed", "Bill from AWS - $3,240", "Receipt: $340 office", "Xero export loaded", "Wave CSV imported", "Bank statement parsed", "CSV import complete"] },
  { size: "lg", pills: ["$45,000 payment received ✓", "Balance sheet updated", "Multi-currency enabled", "Payroll processed ✓", "Cash flow forecast ready"] },
  { size: "sm", pills: ["Reconciled", "Updated", "Matched", "Sorted", "Verified", "Closed", "Exported", "Synced", "Tagged", "Archived", "Settled", "Reviewed"] },
  { size: "md", pills: ["Invoice to Acme Corp", "Bill: $1,200 rent", "Expense: $89 SaaS", "Credit note issued", "Recurring invoice set", "Vendor payment sent", "Client deposit logged", "Journal entry posted"] },
  { size: "lg", pills: ["Year-end close complete ✓", "Auto-categorized $174,900", "GST auto-calculated", "Client portal live ✓", "Global statement imports"] },
  { size: "sm", pills: ["Booked", "Paid", "Sent", "Filed", "Logged", "Tagged", "Approved", "Synced", "Tracked", "Closed", "Imported", "Done"] },
  { size: "md", pills: ["Bank CSV reconciled", "Statement imported", "Payroll entry posted", "Multi-currency entry", "Expense categorized", "CSV mapped", "Bank CSV imported", "Transactions matched"] },
];

const marqueeSizeClasses = {
  lg: "px-5 py-2.5 text-sm",
  md: "px-3 py-1.5 text-[10px]",
  sm: "px-2 py-1 text-[9px]",
};

function MarqueeView() {
  return (
    <div className="flex h-full flex-col justify-evenly overflow-hidden">
      {marqueeConfig.map((row, rowIdx) => {
        const duration = 25 + (rowIdx % 4) * 8;
        const reverse = rowIdx % 2 === 1;
        const sizeClass = marqueeSizeClasses[row.size];
        return (
          <div key={rowIdx} className="relative flex overflow-hidden">
            <div
              className="flex shrink-0 items-center gap-2"
              style={{
                animation: `marquee-${reverse ? "reverse" : "forward"} ${duration}s linear infinite`,
              }}
            >
              {[...row.pills, ...row.pills, ...row.pills, ...row.pills].map((pill, j) => {
                const isFeatured = pill.includes("✓") || pill.includes("$") || pill.includes("ready");
                return (
                  <span
                    key={j}
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-full font-medium text-white backdrop-blur-sm",
                      sizeClass,
                      isFeatured
                        ? "border border-white/20 bg-white/20"
                        : "bg-white/10"
                    )}
                  >
                    {pill}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes marquee-forward {
          from { transform: translateX(0); }
          to { transform: translateX(-25%); }
        }
        @keyframes marquee-reverse {
          from { transform: translateX(-25%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

/* --- View 1: Connected Node Network --- */
const networkNodes = [
  { label: "Invoices", x: 8, y: 12 },
  { label: "CSV Import", x: 28, y: 8 },
  { label: "Reconciliation", x: 5, y: 42 },
  { label: "Expenses", x: 25, y: 48 },
  { label: "P&L Report", x: 48, y: 15 },
  { label: "Tax filing", x: 72, y: 10 },
  { label: "Clients", x: 88, y: 18 },
  { label: "Bills", x: 68, y: 42 },
  { label: "Payroll", x: 8, y: 75 },
  { label: "Receipts", x: 42, y: 78 },
  { label: "Accounts", x: 75, y: 75 },
  { label: "Multi-currency", x: 88, y: 55 },
  { label: "Balance sheet", x: 52, y: 52 },
  { label: "Journal entries", x: 15, y: 25 },
];

const networkEdges = [
  [0, 1], [0, 13], [1, 4], [2, 3], [2, 8], [3, 12],
  [4, 5], [5, 6], [6, 7], [7, 11], [8, 9], [9, 10],
  [10, 11], [12, 7], [12, 9], [13, 3],
];

function NetworkView() {
  return (
    <div className="relative h-full w-full">
      <svg className="absolute inset-0 h-full w-full">
        {networkEdges.map(([from, to], i) => (
          <motion.line
            key={i}
            x1={`${networkNodes[from].x}%`}
            y1={`${networkNodes[from].y}%`}
            x2={`${networkNodes[to].x}%`}
            y2={`${networkNodes[to].y}%`}
            stroke="white"
            strokeOpacity="0.15"
            strokeWidth="1"
            strokeDasharray="6 4"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1, strokeDashoffset: [0, -20] }}
            transition={{
              pathLength: { duration: 1.5, delay: i * 0.08 },
              strokeDashoffset: { duration: 3, repeat: Infinity, ease: "linear" },
            }}
          />
        ))}
      </svg>
      {networkNodes.map((node, i) => (
        <motion.div
          key={i}
          className="absolute rounded-xl bg-white/15 px-3 py-1.5 text-[10px] font-medium text-white backdrop-blur-sm"
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: 1,
            scale: 1,
            y: [0, -5, 0],
          }}
          transition={{
            opacity: { duration: 0.4, delay: i * 0.06 },
            scale: { duration: 0.4, delay: i * 0.06 },
            y: { duration: 3 + (i % 3), delay: i * 0.2, repeat: Infinity, ease: "easeInOut" },
          }}
        >
          {node.label}
        </motion.div>
      ))}
    </div>
  );
}

/* --- View 2: Stacked Receipt Cards --- */
const receiptCards = [
  { desc: "Invoice — Acme Corp", amount: "+$12,580", status: "Sent", x: 4, y: 6, rotate: -4, z: 1 },
  { desc: "Bill — AWS hosting", amount: "-$3,240", status: "Paid", x: 62, y: 4, rotate: 3, z: 2 },
  { desc: "Payroll — March", amount: "-$28,450", status: "Processed", x: 30, y: 18, rotate: -2, z: 3 },
  { desc: "Client payment", amount: "+$45,000", status: "Received", x: 72, y: 28, rotate: 5, z: 2 },
  { desc: "Expense — Office rent", amount: "-$8,900", status: "Booked", x: 6, y: 55, rotate: 2, z: 1 },
  { desc: "Bank CSV — Chase", amount: "+$67,800", status: "Imported", x: 55, y: 62, rotate: -5, z: 2 },
  { desc: "Revenue — Sales", amount: "+$92,100", status: "Booked", x: 78, y: 70, rotate: 3, z: 1 },
  { desc: "Credit note — #CN-041", amount: "-$2,400", status: "Issued", x: 22, y: 72, rotate: -3, z: 3 },
];

function ReceiptView() {
  return (
    <div className="relative h-full w-full">
      {receiptCards.map((card, i) => (
        <motion.div
          key={i}
          className="absolute w-[160px] rounded-xl bg-white/15 p-3 backdrop-blur-sm md:w-[180px]"
          style={{
            left: `${card.x}%`,
            top: `${card.y}%`,
            zIndex: card.z,
          }}
          initial={{ opacity: 0, scale: 0.85, rotate: card.rotate }}
          animate={{
            opacity: 1,
            scale: 1,
            rotate: card.rotate,
            y: [0, -4, 0],
          }}
          transition={{
            opacity: { duration: 0.4, delay: i * 0.08 },
            scale: { duration: 0.4, delay: i * 0.08 },
            y: { duration: 3.5 + (i % 3), delay: i * 0.3, repeat: Infinity, ease: "easeInOut" },
          }}
        >
          <div className="mb-1.5 flex items-center gap-1.5">
            <div className="flex size-4 items-center justify-center rounded-full bg-white/20">
              <Check className="size-2.5 text-white" />
            </div>
            <span className="truncate text-[9px] text-white/70">{card.desc}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className={cn(
              "text-xs font-bold",
              card.amount.startsWith("+") ? "text-emerald-200" : "text-white"
            )}>
              {card.amount}
            </span>
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[8px] font-medium text-white">
              {card.status}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* --- Main Showcase Component --- */
const CYCLE_DURATION = 6000;

function SolutionShowcase() {
  const [activeView, setActiveView] = useState(0);
  const [progressKey, setProgressKey] = useState(0);

  const advance = useCallback(() => {
    setActiveView((v) => (v + 1) % 3);
    setProgressKey((k) => k + 1);
  }, []);

  const goTo = useCallback((idx: number) => {
    setActiveView(idx);
    setProgressKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const timer = setTimeout(advance, CYCLE_DURATION);
    return () => clearTimeout(timer);
  }, [activeView, progressKey, advance]);

  const views = [MarqueeView, NetworkView, ReceiptView];
  const ActiveView = views[activeView];

  return (
    <div className="relative min-h-[400px] md:min-h-[500px]">
      {/* View content — fills entire space, radial fade in center */}
      <div className="absolute inset-0 overflow-hidden" style={{
        maskImage: "radial-gradient(ellipse 120px 100px at center, transparent 40%, black 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 120px 100px at center, transparent 40%, black 100%)",
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            className="h-full w-full"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.3 }}
          >
            <ActiveView />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Center logo badge — frosted glass with border */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <motion.div
          className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/[0.1] px-5 py-4 shadow-xl shadow-emerald-900/20 ring-1 ring-white/[0.06] backdrop-blur-xl"
          animate={{
            boxShadow: [
              "0 10px 40px -10px rgba(16, 185, 129, 0.15)",
              "0 10px 40px -10px rgba(16, 185, 129, 0.3)",
              "0 10px 40px -10px rgba(16, 185, 129, 0.15)",
            ],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg
            viewBox="0 0 40 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-10 shrink-0"
          >
            <path
              d="M18 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10h-8V4z"
              fill="white"
              fillOpacity="0.4"
            />
            <path
              d="M4 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10H4V4z"
              fill="white"
              fillOpacity="0.85"
            />
          </svg>
          <span className="text-sm font-semibold tracking-tight text-white/90">dubbl</span>
        </motion.div>
      </div>

      {/* Progress bars — bottom center, compact */}
      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
        {[0, 1, 2].map((idx) => (
          <button
            key={`${idx}-${progressKey}`}
            onClick={() => goTo(idx)}
            className="h-1 w-8 cursor-pointer overflow-hidden rounded-full bg-white/25"
          >
            <div
              className={cn(
                "h-full rounded-full bg-white/70",
                idx < activeView && "w-full",
                idx > activeView && "w-0",
                idx === activeView && "animate-[progress-fill_6s_linear_forwards]"
              )}
            />
          </button>
        ))}
      </div>

      <style>{`
        @keyframes progress-fill {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Solution Section                                                          */
/* -------------------------------------------------------------------------- */

const capabilities = [
  {
    headline: "Unlimited Invoices",
    description: "Create, send, and track invoices with no caps or usage limits.",
    icon: FileText,
  },
  {
    headline: "CSV Import & Export",
    description: "Import from QuickBooks, Xero, FreshBooks, Wave, or any CSV format. Live bank feeds coming soon.",
    icon: Building2,
  },
  {
    headline: "15 MCP Tool Modules",
    description: "Let AI agents manage your business data through the Model Context Protocol.",
    icon: Globe,
  },
];

function SolutionSection() {
  return (
    <section className="py-16 md:py-20">
      <Container>
        {/* Header band with green grain gradient */}
        <ScrollReveal>
          <div className="relative overflow-hidden rounded-2xl border border-emerald-400/30 p-8 dark:border-emerald-500/20 md:p-12">
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
            <div className="relative">
              <div className="mb-5">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-900/30 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
                  <span className="inline-block size-1.5 rounded-full bg-emerald-300" />
                  The Solution
                </span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
                One unified platform for{" "}
                <span className="text-emerald-950">
                  your entire business
                </span>
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-emerald-100">
                dubbl brings accounting, invoicing, inventory, project management,
                payroll, and CRM into one place. AI-ready with built-in MCP
                support.
              </p>
            </div>
          </div>
        </ScrollReveal>

        {/* Capabilities row */}
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {capabilities.map((cap, i) => (
            <ScrollReveal key={cap.headline} delay={0.1 + i * 0.1}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="flex items-start gap-4 rounded-2xl border border-border bg-card p-6 transition-colors hover:border-emerald-300/50 dark:hover:border-emerald-700/50"
              >
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50">
                  <cap.icon className="size-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-foreground">
                    {cap.headline}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {cap.description}
                  </p>
                </div>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>

        {/* Dashboard card with grain gradient background */}
        <ScrollReveal delay={0.2}>
          <div className="mt-8">
            <motion.div
              className="relative overflow-hidden rounded-2xl border border-emerald-400/30 dark:border-emerald-500/20"
              initial={{ y: 30, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: false, margin: "-80px" }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
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
              <div className="relative">
                <SolutionShowcase />
              </div>
            </motion.div>
          </div>
        </ScrollReveal>

        {/* Trust signals */}
        <ScrollReveal delay={0.3}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {[
              "Self-hostable",
              "Full audit trail",
              "CSV import from any source",
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

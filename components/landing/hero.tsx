"use client";

import { motion } from "motion/react";
import { ArrowRight, Github } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/shared/container";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Decorative SVG — positioned behind the right column                */
/* ------------------------------------------------------------------ */

function OrbitalDecoration() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.6, ease: "easeOut" }}
      className="pointer-events-none absolute -right-[10%] -top-[15%] h-[800px] w-[800px] lg:h-[900px] lg:w-[900px]"
    >
      <svg
        viewBox="0 0 720 720"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        <motion.ellipse
          cx="360"
          cy="360"
          rx="340"
          ry="340"
          stroke="url(#ring-gradient-1)"
          strokeWidth="0.75"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, delay: 0.2, ease: "easeOut" }}
        />
        <motion.ellipse
          cx="360"
          cy="360"
          rx="280"
          ry="280"
          stroke="url(#ring-gradient-2)"
          strokeWidth="0.75"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.8, delay: 0.4, ease: "easeOut" }}
        />
        <motion.ellipse
          cx="360"
          cy="360"
          rx="210"
          ry="210"
          stroke="url(#ring-gradient-3)"
          strokeWidth="0.75"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.6, delay: 0.6, ease: "easeOut" }}
        />
        <motion.ellipse
          cx="360"
          cy="360"
          rx="140"
          ry="140"
          stroke="url(#ring-gradient-2)"
          strokeWidth="0.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, delay: 0.8, ease: "easeOut" }}
        />

        {/* Arc segments */}
        <motion.path
          d="M 360 60 A 300 300 0 0 1 620 260"
          stroke="url(#arc-gradient-1)"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, delay: 0.5, ease: "easeOut" }}
        />
        <motion.path
          d="M 100 460 A 300 300 0 0 1 260 120"
          stroke="url(#arc-gradient-2)"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.4, delay: 0.7, ease: "easeOut" }}
        />
        <motion.path
          d="M 500 640 A 260 260 0 0 1 660 420"
          stroke="url(#arc-gradient-1)"
          strokeWidth="0.75"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.9, ease: "easeOut" }}
        />

        {/* Dot accents */}
        <motion.circle
          cx="360"
          cy="60"
          r="2.5"
          fill="#10b981"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ duration: 0.8, delay: 1.2 }}
        />
        <motion.circle
          cx="620"
          cy="260"
          r="2"
          fill="#10b981"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          transition={{ duration: 0.8, delay: 1.4 }}
        />
        <motion.circle
          cx="100"
          cy="460"
          r="2"
          fill="#10b981"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          transition={{ duration: 0.8, delay: 1.6 }}
        />

        <defs>
          <linearGradient id="ring-gradient-1" x1="0" y1="0" x2="720" y2="720">
            <stop stopColor="#10b981" stopOpacity="0.15" />
            <stop offset="0.5" stopColor="#10b981" stopOpacity="0.08" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="ring-gradient-2" x1="720" y1="0" x2="0" y2="720">
            <stop stopColor="#10b981" stopOpacity="0.12" />
            <stop offset="0.5" stopColor="#10b981" stopOpacity="0.05" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="ring-gradient-3" x1="0" y1="360" x2="720" y2="360">
            <stop stopColor="#10b981" stopOpacity="0.18" />
            <stop offset="0.5" stopColor="#10b981" stopOpacity="0.06" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id="arc-gradient-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="arc-gradient-2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0.05" />
          </linearGradient>
        </defs>
      </svg>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard Mockup — right column visual                             */
/* ------------------------------------------------------------------ */

function DashboardMockup() {
  const barData = [
    { height: 35, label: "Jan" },
    { height: 52, label: "Feb" },
    { height: 44, label: "Mar" },
    { height: 70, label: "Apr" },
    { height: 58, label: "May" },
    { height: 82, label: "Jun" },
    { height: 65, label: "Jul" },
    { height: 90, label: "Aug" },
    { height: 74, label: "Sep" },
    { height: 68, label: "Oct" },
    { height: 85, label: "Nov" },
    { height: 95, label: "Dec" },
  ];

  const transactions = [
    {
      date: "Dec 15",
      desc: "Client Payment — Acme",
      debit: "—",
      credit: "$12,500",
      bal: "$48,250",
    },
    {
      date: "Dec 14",
      desc: "Office Supplies",
      debit: "$240",
      credit: "—",
      bal: "$35,750",
    },
    {
      date: "Dec 13",
      desc: "Software — Figma",
      debit: "$75",
      credit: "—",
      bal: "$35,990",
    },
    {
      date: "Dec 12",
      desc: "Consulting Revenue",
      debit: "—",
      credit: "$5,000",
      bal: "$36,065",
    },
  ];

  const stats = [
    {
      label: "Revenue",
      value: 48250,
      prefix: "$",
      change: "+12.5%",
      positive: true,
    },
    {
      label: "Expenses",
      value: 12840,
      prefix: "$",
      change: "-3.2%",
      positive: true,
    },
    {
      label: "Net Income",
      value: 35410,
      prefix: "$",
      change: "+18.1%",
      positive: true,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 32, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, delay: 0.4, ease: "easeOut" }}
    >
      <div
        className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/8 dark:shadow-black/40"
        style={{ perspective: "1200px" }}
      >
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
          <div className="size-2.5 rounded-full bg-[#ff5f57]" />
          <div className="size-2.5 rounded-full bg-[#febc2e]" />
          <div className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-[11px] font-medium text-muted-foreground">
            dubbl — Dashboard
          </span>
        </div>

        <div className="p-4 sm:p-5">
          {/* Stat cards */}
          <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: 0.7 + i * 0.1,
                  ease: "easeOut",
                }}
                className="rounded-lg border border-border bg-background p-2.5 sm:p-3"
              >
                <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground sm:text-[10px]">
                  {stat.label}
                </p>
                <p className="mt-0.5 text-sm font-bold text-foreground sm:text-base">
                  <AnimatedCounter
                    target={stat.value}
                    prefix={stat.prefix}
                    duration={1600}
                  />
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-[9px] font-medium sm:text-[10px]",
                    stat.positive
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-500 dark:text-red-400"
                  )}
                >
                  {stat.change}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Bar chart */}
          <div className="mb-4 rounded-lg border border-border bg-background p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-medium text-foreground sm:text-xs">
                Monthly Revenue
              </p>
              <p className="text-[9px] text-muted-foreground sm:text-[10px]">
                2025
              </p>
            </div>
            <div className="flex items-end gap-1" style={{ height: 72 }}>
              {barData.map((bar, i) => (
                <motion.div
                  key={bar.label}
                  className="flex-1 rounded-t bg-gradient-to-t from-emerald-600 to-emerald-400 dark:from-emerald-500 dark:to-emerald-300"
                  initial={{ height: 0 }}
                  animate={{ height: `${bar.height}%` }}
                  transition={{
                    duration: 0.6,
                    delay: 0.9 + i * 0.05,
                    ease: "easeOut",
                  }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex gap-1">
              {barData.map((bar) => (
                <span
                  key={bar.label}
                  className="flex-1 text-center text-[7px] text-muted-foreground sm:text-[8px]"
                >
                  {bar.label}
                </span>
              ))}
            </div>
          </div>

          {/* Transaction rows */}
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[44px_1fr_62px_68px_68px] gap-1 border-b border-border bg-muted/50 px-2.5 py-1.5 text-[8px] font-medium uppercase tracking-wider text-muted-foreground sm:grid-cols-[52px_1fr_72px_80px_80px] sm:px-3 sm:text-[9px]">
              <span>Date</span>
              <span>Description</span>
              <span className="text-right">Debit</span>
              <span className="text-right">Credit</span>
              <span className="text-right">Balance</span>
            </div>
            {transactions.map((tx, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.35,
                  delay: 1.4 + i * 0.1,
                  ease: "easeOut",
                }}
                className="grid grid-cols-[44px_1fr_62px_68px_68px] gap-1 border-b border-border/40 px-2.5 py-2 text-[9px] last:border-0 sm:grid-cols-[52px_1fr_72px_80px_80px] sm:px-3 sm:text-[10px]"
              >
                <span className="text-muted-foreground">{tx.date}</span>
                <span className="truncate font-medium text-foreground">
                  {tx.desc}
                </span>
                <span className="text-right tabular-nums text-muted-foreground">
                  {tx.debit}
                </span>
                <span
                  className={cn(
                    "text-right tabular-nums font-medium",
                    tx.credit !== "—"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                  )}
                >
                  {tx.credit}
                </span>
                <span className="text-right tabular-nums font-medium text-foreground">
                  {tx.bal}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero Section                                                       */
/* ------------------------------------------------------------------ */

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24">
      {/* Orbital SVG behind the right half */}
      <OrbitalDecoration />

      {/* Subtle edge fades */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />

      <Container className="relative">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          {/* ---- LEFT: Text content ---- */}
          <div>
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>
                Open Source &middot; Apache 2.0
              </div>
            </motion.div>

            {/* Heading */}
            <motion.h1
              className="text-4xl font-bold leading-[1.08] tracking-tight text-foreground sm:text-5xl md:text-6xl"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              Bookkeeping
              <br />
              <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400 bg-clip-text text-transparent dark:from-emerald-400 dark:via-emerald-300 dark:to-teal-300">
                for modern
              </span>
              <br />
              teams
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              Double-entry accounting that developers love. Self-host, extend
              via API, and own your financial data&mdash;forever free.
            </motion.p>

            {/* CTA buttons */}
            <motion.div
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Link
                href="/sign-up"
                className={cn(
                  "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-7",
                  "text-sm font-semibold text-white shadow-md shadow-emerald-600/20",
                  "transition-all duration-200 hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-600/25",
                  "active:scale-[0.98]"
                )}
              >
                Get Started
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="https://github.com/dubbl-org/dubbl"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-7",
                  "text-sm font-semibold text-foreground shadow-sm",
                  "transition-all duration-200 hover:bg-muted",
                  "active:scale-[0.98]"
                )}
              >
                <Github className="size-4" />
                View on GitHub
              </a>
            </motion.div>

            {/* Sub-text */}
            <motion.p
              className="mt-4 text-sm text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.45 }}
            >
              Free forever &middot; No credit card required
            </motion.p>
          </div>

          {/* ---- RIGHT: Dashboard mockup ---- */}
          <div className="relative lg:pl-2">
            <DashboardMockup />
          </div>
        </div>
      </Container>
    </section>
  );
}

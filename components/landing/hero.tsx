"use client";

import { motion } from "motion/react";
import { ArrowRight, Github } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/shared/container";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Floating data cards — scattered around the hero                    */
/* ------------------------------------------------------------------ */

function FloatingCard({
  children,
  className,
  delay = 0,
  rotate = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  rotate?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotate: rotate * 0.5 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "absolute overflow-hidden rounded-xl border border-border bg-card/90 shadow-lg shadow-black/5 backdrop-blur-sm dark:bg-card/80 dark:shadow-black/20",
        className
      )}
    >
      {/* Shimmer sweep */}
      <motion.div
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-emerald-500/[0.12] to-transparent dark:via-emerald-500/[0.06]"
        animate={{ translateX: ["calc(-100%)", "calc(200%)"] }}
        transition={{
          duration: 3,
          delay: delay + 2,
          repeat: Infinity,
          repeatDelay: 5 + delay * 2,
          ease: "easeInOut",
        }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

function DataVisuals() {
  // Line chart path data — animates drawing continuously
  const chartPath = "M 0 40 C 10 38, 20 35, 30 30 S 50 20, 60 22 S 80 28, 90 18 S 110 8, 120 12 S 140 20, 150 10 S 170 5, 180 8";
  const chartPath2 = "M 0 44 C 15 42, 25 40, 35 36 S 55 30, 65 32 S 85 35, 95 28 S 115 22, 125 26 S 145 30, 155 20 S 175 18, 180 22";

  return (
    <>
      {/* Top-left: Revenue line chart — continuously drawing */}
      <FloatingCard
        className="left-[2%] top-[12%] hidden w-52 px-3.5 py-3 lg:block xl:left-[6%]"
        delay={0.7}
        rotate={-2}
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Revenue</p>
          <motion.span
            className="font-mono text-[11px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            $48,250
          </motion.span>
        </div>
        <svg viewBox="0 0 180 50" className="h-10 w-full">
          {/* Area fill */}
          <motion.path
            d={chartPath + " L 180 50 L 0 50 Z"}
            fill="url(#areaGrad)"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.15, 0.3, 0.15] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Main line */}
          <motion.path
            d={chartPath}
            stroke="#10b981"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 1, 0] }}
            transition={{ duration: 6, repeat: Infinity, times: [0, 0.4, 0.7, 1], ease: "easeInOut" }}
          />
          {/* Secondary line */}
          <motion.path
            d={chartPath2}
            stroke="#10b981"
            strokeWidth="1"
            strokeOpacity="0.3"
            fill="none"
            strokeLinecap="round"
            strokeDasharray="3 3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 1, 0] }}
            transition={{ duration: 6, delay: 0.5, repeat: Infinity, times: [0, 0.4, 0.7, 1], ease: "easeInOut" }}
          />
          {/* Moving dot on the line */}
          <motion.circle
            r="2.5"
            fill="#10b981"
            animate={{
              cx: [0, 30, 60, 90, 120, 150, 180],
              cy: [40, 30, 22, 18, 12, 10, 8],
              opacity: [0, 1, 1, 1, 1, 1, 0],
            }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <div className="mt-1 flex items-center gap-1">
          <motion.div
            className="size-1.5 rounded-full bg-emerald-500"
            animate={{ scale: [1, 1.4, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className="text-[9px] text-emerald-600 dark:text-emerald-400">+12.5% this month</span>
        </div>
      </FloatingCard>

      {/* Top-right: Animated bar chart — bars cycle heights */}
      <FloatingCard
        className="right-[2%] top-[8%] hidden w-48 px-3.5 py-3 lg:block xl:right-[6%]"
        delay={0.85}
        rotate={1.5}
      >
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Monthly P&amp;L
        </p>
        <div className="flex items-end gap-[3px]" style={{ height: 48 }}>
          {[35, 52, 44, 70, 58, 82, 65, 90, 74, 85, 95].map((h, i) => (
            <motion.div
              key={i}
              className="flex-1 rounded-t bg-gradient-to-t from-emerald-600 to-emerald-400 dark:from-emerald-500 dark:to-emerald-300"
              animate={{
                height: [`${h}%`, `${Math.max(20, h + Math.sin(i * 1.5) * 20)}%`, `${h}%`],
              }}
              transition={{
                duration: 3 + i * 0.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.15,
              }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[8px] text-muted-foreground">Jan</span>
          <span className="text-[8px] text-muted-foreground">Nov</span>
        </div>
      </FloatingCard>

      {/* Left-middle: Live transactions feed — rows appear and fade */}
      <FloatingCard
        className="left-0 top-[42%] hidden w-56 px-3.5 py-3 lg:block xl:left-[3%]"
        delay={1.0}
        rotate={-1}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Live Feed
          </p>
          <motion.div
            className="flex items-center gap-1"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <div className="size-1.5 rounded-full bg-emerald-500" />
            <span className="text-[8px] font-medium text-emerald-600 dark:text-emerald-400">LIVE</span>
          </motion.div>
        </div>
        {[
          { desc: "Client Payment", amount: "+$12,500", positive: true, delay: 0 },
          { desc: "Office Supplies", amount: "-$240", positive: false, delay: 2 },
          { desc: "Consulting", amount: "+$5,000", positive: true, delay: 4 },
        ].map((tx) => (
          <motion.div
            key={tx.desc}
            className="flex items-center justify-between border-b border-border/30 py-1.5 last:border-0"
            animate={{ opacity: [0.4, 1, 1, 0.4] }}
            transition={{ duration: 6, delay: tx.delay, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="text-[11px] text-foreground">{tx.desc}</span>
            <span className={cn(
              "font-mono text-[11px] tabular-nums font-semibold",
              tx.positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
            )}>
              {tx.amount}
            </span>
          </motion.div>
        ))}
      </FloatingCard>

      {/* Right-middle: Donut chart + trial balance */}
      <FloatingCard
        className="right-0 top-[45%] hidden px-3.5 py-3 lg:block xl:right-[3%]"
        delay={1.1}
        rotate={2}
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Asset Allocation
        </p>
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 36 36" className="size-14">
            {/* Background ring */}
            <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
            {/* Animated segments */}
            <motion.circle
              cx="18" cy="18" r="15" fill="none"
              stroke="#10b981" strokeWidth="3"
              strokeDasharray="55 45"
              strokeDashoffset="0"
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
              animate={{ strokeDasharray: ["55 45", "60 40", "55 45"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.circle
              cx="18" cy="18" r="15" fill="none"
              stroke="#0d9488" strokeWidth="3"
              strokeDasharray="25 75"
              strokeDashoffset="-55"
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
              animate={{ strokeDasharray: ["25 75", "22 78", "25 75"] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.circle
              cx="18" cy="18" r="15" fill="none"
              stroke="#6ee7b7" strokeWidth="3"
              strokeDasharray="15 85"
              strokeDashoffset="-80"
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
              animate={{ strokeDasharray: ["15 85", "18 82", "15 85"] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            />
          </svg>
          <div className="space-y-1.5">
            {[
              { label: "Cash", pct: "58%", color: "bg-emerald-500" },
              { label: "Receivables", pct: "26%", color: "bg-teal-600" },
              { label: "Other", pct: "16%", color: "bg-emerald-300" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <div className={cn("size-1.5 rounded-full", s.color)} />
                <span className="text-[9px] text-muted-foreground">{s.label}</span>
                <span className="font-mono text-[9px] font-semibold text-foreground">{s.pct}</span>
              </div>
            ))}
          </div>
        </div>
      </FloatingCard>

      {/* Bottom-left: Sparkline stat cards */}
      <FloatingCard
        className="bottom-[8%] left-[4%] hidden w-48 px-3.5 py-3 lg:block xl:left-[8%]"
        delay={1.25}
        rotate={-1.5}
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Stats
        </p>
        {[
          { label: "Accounts", value: "23", spark: "M0 8 L3 6 L6 7 L9 4 L12 5 L15 3 L18 4 L21 2 L24 3" },
          { label: "Entries", value: "142", spark: "M0 6 L3 8 L6 5 L9 7 L12 3 L15 5 L18 2 L21 4 L24 1" },
          { label: "Contacts", value: "38", spark: "M0 5 L3 4 L6 6 L9 3 L12 5 L15 2 L18 3 L21 1 L24 2" },
        ].map((s, i) => (
          <div key={s.label} className="flex items-center justify-between border-b border-border/30 py-1.5 last:border-0">
            <div>
              <p className="text-[9px] text-muted-foreground">{s.label}</p>
              <p className="font-mono text-[12px] font-bold tabular-nums text-foreground">{s.value}</p>
            </div>
            <svg viewBox="0 0 24 10" className="h-3 w-8">
              <motion.path
                d={s.spark}
                stroke="#10b981"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: [0, 1] }}
                transition={{ duration: 1.5, delay: 2 + i * 0.3, repeat: Infinity, repeatDelay: 3, ease: "easeOut" }}
              />
            </svg>
          </div>
        ))}
      </FloatingCard>

      {/* Bottom-right: Invoice status with animated progress */}
      <FloatingCard
        className="bottom-[10%] right-[4%] hidden w-44 px-3.5 py-3 lg:block xl:right-[8%]"
        delay={1.35}
        rotate={1}
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Invoices
        </p>
        {[
          { id: "INV-012", status: "Paid", pct: 100, color: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
          { id: "INV-011", status: "Sent", pct: 60, color: "bg-blue-500", text: "text-blue-600 dark:text-blue-400" },
          { id: "INV-010", status: "Overdue", pct: 0, color: "bg-red-500", text: "text-red-500 dark:text-red-400" },
        ].map((inv, i) => (
          <div key={inv.id} className="border-b border-border/30 py-1.5 last:border-0">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground">{inv.id}</span>
              <span className={cn("text-[10px] font-semibold", inv.text)}>{inv.status}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-border/50">
              <motion.div
                className={cn("h-full rounded-full", inv.color)}
                initial={{ width: "0%" }}
                animate={{ width: `${inv.pct}%` }}
                transition={{ duration: 1.5, delay: 2.5 + i * 0.3, repeat: Infinity, repeatDelay: 4, ease: "easeOut" }}
              />
            </div>
          </div>
        ))}
      </FloatingCard>

      {/* Scattered pulsing numbers */}
      {[
        { val: "$48,250", x: "left-[18%]", y: "top-[28%]", delay: 1.5, dur: 4 },
        { val: "23", x: "right-[20%]", y: "top-[30%]", delay: 1.6, dur: 5 },
        { val: "+18.1%", x: "left-[22%]", y: "bottom-[22%]", delay: 1.7, dur: 3.5 },
        { val: "JE-047", x: "right-[18%]", y: "bottom-[18%]", delay: 1.8, dur: 4.5 },
      ].map((item) => (
        <motion.span
          key={item.val}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.12, 0.06, 0.12, 0] }}
          transition={{
            duration: item.dur,
            delay: item.delay,
            repeat: Infinity,
            repeatDelay: 2,
            ease: "easeInOut",
          }}
          className={cn(
            "absolute hidden font-mono text-xs tabular-nums font-semibold text-foreground lg:block",
            item.x,
            item.y
          )}
        >
          {item.val}
        </motion.span>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Background                                                         */
/* ------------------------------------------------------------------ */

function HeroBackground() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#10b98112_1px,transparent_1px),linear-gradient(to_bottom,#10b98112_1px,transparent_1px)] bg-[size:48px_48px] dark:bg-[linear-gradient(to_right,#10b98106_1px,transparent_1px),linear-gradient(to_bottom,#10b98106_1px,transparent_1px)]" />

      {/* Radial glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,rgba(16,185,129,0.18),transparent_70%)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,rgba(16,185,129,0.1),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_30%_30%,rgba(20,184,166,0.1),transparent)] dark:bg-[radial-gradient(ellipse_40%_30%_at_30%_30%,rgba(20,184,166,0.06),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_70%_60%,rgba(16,185,129,0.08),transparent)] dark:bg-[radial-gradient(ellipse_40%_30%_at_70%_60%,rgba(16,185,129,0.05),transparent)]" />

      {/* Pulsing center glow */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.07] blur-[120px] dark:bg-emerald-500/[0.04]"
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Orbital rings — centered, slow continuous rotation */}
      <motion.svg
        viewBox="0 0 1200 1200"
        fill="none"
        className="absolute left-1/2 top-1/2 h-[1000px] w-[1000px] -translate-x-1/2 -translate-y-1/2 lg:h-[1400px] lg:w-[1400px]"
        initial={{ opacity: 0, scale: 0.8, rotate: -15 }}
        animate={{ opacity: 0.6, scale: 1, rotate: 360 }}
        transition={{
          opacity: { duration: 2.5, ease: "easeOut" },
          scale: { duration: 2.5, ease: "easeOut" },
          rotate: { duration: 120, ease: "linear", repeat: Infinity },
        }}
      >
        <ellipse cx="600" cy="600" rx="580" ry="580" stroke="url(#hr1)" strokeWidth="1" />
        <ellipse cx="600" cy="600" rx="460" ry="460" stroke="url(#hr2)" strokeWidth="0.8" />
        <ellipse cx="600" cy="600" rx="340" ry="340" stroke="url(#hr1)" strokeWidth="0.6" />
        <ellipse cx="600" cy="600" rx="220" ry="220" stroke="url(#hr2)" strokeWidth="0.5" />

        <path d="M 600 20 A 580 580 0 0 1 1100 350" stroke="url(#ha1)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M 100 850 A 580 580 0 0 1 320 100" stroke="url(#ha2)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M 880 1100 A 460 460 0 0 1 1060 680" stroke="url(#ha1)" strokeWidth="1" strokeLinecap="round" fill="none" />

        <circle cx="600" cy="20" r="4" fill="#10b981" opacity="0.5" />
        <circle cx="1100" cy="350" r="3" fill="#10b981" opacity="0.4" />
        <circle cx="100" cy="850" r="3" fill="#10b981" opacity="0.4" />

        <defs>
          <linearGradient id="hr1" x1="0" y1="0" x2="1200" y2="1200">
            <stop stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="0.5" stopColor="#10b981" stopOpacity="0.1" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="hr2" x1="1200" y1="0" x2="0" y2="1200">
            <stop stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="0.5" stopColor="#10b981" stopOpacity="0.08" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="ha1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop stopColor="#10b981" stopOpacity="0.5" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id="ha2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop stopColor="#10b981" stopOpacity="0.4" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0.08" />
          </linearGradient>
        </defs>
      </motion.svg>

      {/* Dashed blueprint rects */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, delay: 0.5 }}
        className="absolute -left-12 top-[12%] size-52 rounded-2xl border border-dashed border-emerald-500/20"
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, delay: 0.7 }}
        className="absolute -right-8 top-[22%] h-40 w-56 rounded-2xl border border-dashed border-emerald-500/15"
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, delay: 0.9 }}
        className="absolute -left-4 bottom-[15%] h-36 w-44 rounded-2xl border border-dashed border-emerald-500/15"
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, delay: 1.0 }}
        className="absolute -right-10 bottom-[20%] size-48 rounded-2xl border border-dashed border-emerald-500/[0.12]"
      />

      {/* Edge fades */}
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-background to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero Section                                                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Live ticker — scrolling events at the top                          */
/* ------------------------------------------------------------------ */

const tickerEvents = [
  "Invoice INV-048 paid  $4,200",
  "New account created  Accounts Receivable",
  "Journal entry JE-102 posted",
  "Bank reconciliation completed  Dec 2025",
  "Revenue recognized  $12,500",
  "Expense recorded  Office Supplies $240",
  "Trial balance verified  Balanced",
  "API call  POST /v1/transactions",
];

function LiveTicker() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, delay: 0.3 }}
      className="relative mx-auto mb-10 max-w-2xl overflow-hidden"
      style={{
        maskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
      }}
    >
      <div className="flex w-max animate-marquee items-center gap-8">
        {[...tickerEvents, ...tickerEvents].map((event, i) => (
          <div key={i} className="flex shrink-0 items-center gap-2 text-[12px] text-muted-foreground/60">
            <span className="size-1 rounded-full bg-emerald-500/50" />
            <span className="whitespace-nowrap font-mono">{event}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero Section                                                       */
/* ------------------------------------------------------------------ */

export function Hero() {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden py-20">
      <HeroBackground />

      {/* Floating data cards */}
      <DataVisuals />

      <Container className="relative">
        <div className="mx-auto max-w-4xl text-center">
          {/* Top: Live ticker */}
          <LiveTicker />

          {/* Decorative lines flanking the headline */}
          <div className="relative">
            {/* Left accent line */}
            <motion.div
              className="absolute -left-8 top-1/2 hidden h-px w-16 -translate-y-1/2 bg-gradient-to-r from-transparent to-emerald-500/30 lg:-left-16 lg:block lg:w-24"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              style={{ transformOrigin: "right" }}
            />
            <motion.div
              className="absolute -left-10 top-1/2 hidden size-1.5 -translate-y-1/2 rounded-full bg-emerald-500/50 lg:-left-18 lg:block"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 1 }}
            />
            {/* Right accent line */}
            <motion.div
              className="absolute -right-8 top-1/2 hidden h-px w-16 -translate-y-1/2 bg-gradient-to-l from-transparent to-emerald-500/30 lg:-right-16 lg:block lg:w-24"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              style={{ transformOrigin: "left" }}
            />
            <motion.div
              className="absolute -right-10 top-1/2 hidden size-1.5 -translate-y-1/2 rounded-full bg-emerald-500/50 lg:-right-18 lg:block"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 1 }}
            />

            {/* Heading */}
            <motion.h1
              className="font-[family-name:var(--font-display)] text-5xl font-semibold leading-[1.08] text-foreground sm:text-6xl md:text-7xl lg:text-8xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Business management{" "}
              <span className="inline-block pr-2 italic bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400 bg-clip-text text-transparent dark:from-emerald-400 dark:via-emerald-300 dark:to-teal-300">
                for modern
              </span>{" "}
              teams
            </motion.h1>
          </div>

          {/* Subtitle */}
          <motion.p
            className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Accounting, projects, inventory, payroll, and CRM in one
            platform. Self-host, extend via API and MCP, and own your
            data. Forever free.
          </motion.p>

          {/* CTA */}
          <motion.div
            className="mt-10 flex flex-col items-center"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
              <Link
                href="/sign-up"
                className={cn(
                  "group relative inline-flex h-13 items-center justify-center gap-2 overflow-hidden rounded-xl bg-emerald-600 px-10",
                  "text-sm font-semibold text-white shadow-lg shadow-emerald-600/25",
                  "transition-all duration-200 hover:bg-emerald-500 hover:shadow-xl hover:shadow-emerald-600/30",
                  "active:scale-[0.98]"
                )}
              >
                {/* Button shimmer */}
                <motion.div
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent"
                  animate={{ translateX: ["calc(-100%)", "calc(200%)"] }}
                  transition={{
                    duration: 2.5,
                    delay: 2,
                    repeat: Infinity,
                    repeatDelay: 4,
                    ease: "easeInOut",
                  }}
                />
                <span className="relative">Get Started Free</span>
                <ArrowRight className="relative size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>

              <a
                href="https://github.com/dubbl-org/dubbl"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "group relative inline-flex h-13 items-center justify-center gap-2 overflow-hidden rounded-xl px-6",
                  "bg-emerald-950 text-emerald-100",
                  "font-mono text-sm font-medium",
                  "shadow-lg shadow-emerald-950/25",
                  "transition-all duration-200 hover:bg-emerald-900 hover:shadow-xl hover:shadow-emerald-950/30",
                  "active:scale-[0.98]",
                  "dark:bg-emerald-950/80 dark:text-emerald-200 dark:border dark:border-emerald-800/40 dark:shadow-emerald-950/40"
                )}
              >
                {/* Animated top-edge scan line */}
                <motion.div
                  className="pointer-events-none absolute top-0 left-0 h-px w-8 bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
                  animate={{ left: ["0%", "100%", "0%"] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
                <Github className="relative size-4" />
                <span className="relative">&gt; git clone</span>
                <motion.span
                  className="relative inline-block h-4 w-px bg-emerald-400"
                  animate={{ opacity: [1, 1, 0, 0] }}
                  transition={{ duration: 1, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
                />
              </a>
            </div>

            {/* Trust signals — terminal style */}
            <div className="mt-12 flex items-center gap-3 font-mono text-[11px] text-muted-foreground sm:gap-5">
              {[
                { icon: "Apache-2.0", label: "Licensed" },
                { icon: "Self-host", label: "Ready" },
                { icon: "MCP-ready", label: "AI-native" },
              ].map((item, i) => (
                <div key={item.icon} className="flex items-center gap-2">
                  {i > 0 && (
                    <span className="text-border/60">·</span>
                  )}
                  <span className="text-emerald-600 dark:text-emerald-400">{item.icon}</span>
                  <span className="text-muted-foreground/60">{item.label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}

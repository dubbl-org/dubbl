"use client";

import { motion } from "motion/react";
import { Github, ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import { Button3D } from "@/components/ui/button-3d";
import { Container } from "@/components/shared/container";
import { HeroBackground } from "@/components/shared/hero-background";
import { AnimatedCounter } from "@/components/shared/animated-counter";

function DashboardMockup() {
  const barHeights = [40, 65, 50, 80, 60, 90, 75];
  const transactions = [
    { desc: "Office Supplies", debit: "$240.00", credit: "-", bal: "$12,460" },
    { desc: "Client Payment", debit: "-", credit: "$5,000", bal: "$17,460" },
    { desc: "Software License", debit: "$99.00", credit: "-", bal: "$17,361" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.3 }}
      className="relative mx-auto mt-16 max-w-4xl"
    >
      {/* Perspective container */}
      <motion.div
        style={{ perspective: "1200px" }}
        initial={{ rotateX: 8 }}
        animate={{ rotateX: 2 }}
        transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
      >
        {/* Gradient border wrapper */}
        <div className="rounded-2xl bg-gradient-to-b from-emerald-300/70 via-emerald-200/40 to-border p-px shadow-[0_8px_40px_-12px_rgba(5,150,105,0.2)]">
          <div className="rounded-2xl bg-white shadow-2xl">
            {/* Title bar */}
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <div className="size-3 rounded-full bg-red-400" />
              <div className="size-3 rounded-full bg-yellow-400" />
              <div className="size-3 rounded-full bg-green-400" />
              <span className="ml-3 text-xs text-muted-foreground">
                dubbl — Dashboard
              </span>
            </div>

            <div className="flex">
              {/* Sidebar */}
              <div className="hidden w-48 border-r bg-muted/30 p-4 sm:block">
                <div className="space-y-3">
                  {[
                    { label: "Dashboard", active: true },
                    { label: "Transactions", active: false },
                    { label: "Accounts", active: false },
                    { label: "Reports", active: false },
                    { label: "Settings", active: false },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className={`rounded-md px-3 py-2 text-xs font-medium ${
                        item.active
                          ? "bg-emerald-100 text-emerald-700"
                          : "text-muted-foreground"
                      }`}
                    >
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Main content */}
              <div className="flex-1 p-4 sm:p-6">
                {/* Stat cards */}
                <div className="mb-6 grid grid-cols-3 gap-3">
                  {[
                    { label: "Revenue", value: 48250, prefix: "$" },
                    { label: "Expenses", value: 12840, prefix: "$" },
                    { label: "Net Income", value: 35410, prefix: "$" },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg border bg-white p-3"
                    >
                      <p className="text-[10px] font-medium text-muted-foreground">
                        {stat.label}
                      </p>
                      <p className="mt-1 text-sm font-bold sm:text-base">
                        <AnimatedCounter
                          target={stat.value}
                          prefix={stat.prefix}
                          duration={1500}
                        />
                      </p>
                    </div>
                  ))}
                </div>

                {/* Bar chart */}
                <div className="mb-6 rounded-lg border p-4">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">
                    Monthly Revenue
                  </p>
                  <div className="flex items-end gap-2" style={{ height: 100 }}>
                    {barHeights.map((h, i) => (
                      <motion.div
                        key={i}
                        className="flex-1 rounded-t bg-emerald-500"
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{
                          duration: 0.6,
                          delay: 0.5 + i * 0.08,
                          ease: "easeOut",
                        }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"].map(
                      (m) => (
                        <span
                          key={m}
                          className="flex-1 text-center text-[9px] text-muted-foreground"
                        >
                          {m}
                        </span>
                      )
                    )}
                  </div>
                </div>

                {/* Transaction rows */}
                <div className="rounded-lg border">
                  <div className="grid grid-cols-4 gap-2 border-b px-3 py-2 text-[10px] font-medium text-muted-foreground">
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
                      transition={{ duration: 0.4, delay: 1.0 + i * 0.15 }}
                      className="grid grid-cols-4 gap-2 border-b px-3 py-2 text-xs last:border-0"
                    >
                      <span className="font-medium">{tx.desc}</span>
                      <span className="text-right text-muted-foreground">
                        {tx.debit}
                      </span>
                      <span className="text-right text-emerald-600">
                        {tx.credit}
                      </span>
                      <span className="text-right font-medium">{tx.bal}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Glow reflection underneath */}
      <div className="mx-auto -mt-4 h-16 w-3/4 rounded-full bg-emerald-400/10 blur-[40px]" />

      {/* Floating decorative elements */}
      <motion.div
        initial={{ opacity: 0, y: 20, x: 20 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ duration: 0.6, delay: 1.2 }}
        className="absolute -top-4 -right-4 z-10 hidden rounded-xl border border-emerald-200/60 bg-white/90 px-3 py-2 shadow-lg backdrop-blur-sm md:block"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-emerald-500" />
          <span className="text-xs font-medium text-gray-700">
            Auto-balanced
          </span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20, x: -20 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ duration: 0.6, delay: 1.4 }}
        className="absolute -bottom-2 -left-4 z-10 hidden rounded-xl border border-gray-800 bg-gray-900 px-3 py-2 shadow-lg md:block"
      >
        <code className="text-[11px] text-emerald-400">
          POST /api/v1/entries{" "}
          <span className="text-gray-400">200 OK</span>
        </code>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: -20, x: -20 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ duration: 0.6, delay: 1.6 }}
        className="absolute top-12 -left-8 z-10 hidden rounded-xl border border-gray-200/80 bg-white/90 px-3 py-2 shadow-lg backdrop-blur-sm md:block"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="size-3.5 text-emerald-500" />
          <div>
            <p className="text-[10px] text-muted-foreground">Net Income</p>
            <p className="text-xs font-bold text-gray-900">+$35,410</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-16 md:pt-40 md:pb-24">
      {/* Architectural background */}
      <HeroBackground />

      <Container className="relative">
        <div className="text-center">
          {/* Badge with animated ping */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200/60 bg-white/80 px-4 py-1.5 backdrop-blur-sm">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-sm font-medium text-emerald-700">
                Apache 2.0 Licensed
              </span>
            </div>
          </motion.div>

          {/* Heading with gradient text */}
          <motion.h1
            className="mx-auto max-w-4xl text-5xl font-extrabold tracking-tight md:text-6xl lg:text-7xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <span className="block">Open source bookkeeping,</span>
            <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 bg-clip-text text-transparent">
              done right.
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Double-entry accounting that developers love. Self-host, extend via
            API, and own your financial data — forever free.
          </motion.p>

          {/* Animated gradient underline */}
          <motion.div
            className="mx-auto mt-4 flex justify-center"
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <div className="h-px w-24 bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
          </motion.div>

          {/* 3D Buttons */}
          <motion.div
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Button3D variant="primary" size="lg">
              Get Started
              <ArrowRight className="size-4" />
            </Button3D>
            <Button3D variant="secondary" size="lg" asChild>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="size-4" />
                View on GitHub
              </a>
            </Button3D>
          </motion.div>
        </div>

        <DashboardMockup />
      </Container>
    </section>
  );
}

"use client";

import { motion } from "motion/react";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/shared/container";
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
      {/* Gradient border wrapper */}
      <div className="rounded-xl bg-gradient-to-b from-emerald-200/60 via-border to-border p-px">
        <div className="animate-float rounded-xl bg-white shadow-2xl">
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
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-16 md:pt-40 md:pb-24">
      {/* Grid background */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

      {/* Glow blob */}
      <div className="animate-pulse-glow pointer-events-none absolute top-0 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-emerald-400/20 blur-[120px]" />

      <Container className="relative">
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge
              variant="secondary"
              className="mb-6 border-emerald-200 bg-emerald-50 text-emerald-700"
            >
              Apache 2.0 Licensed
            </Badge>
          </motion.div>

          <motion.h1
            className="mx-auto max-w-4xl text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Open source bookkeeping,{" "}
            <span className="text-emerald-600">done right.</span>
          </motion.h1>

          <motion.p
            className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Double-entry accounting that developers love. Self-host, extend via
            API, and own your financial data — forever free.
          </motion.p>

          <motion.div
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Button
              size="lg"
              className="bg-emerald-600 px-8 hover:bg-emerald-700"
            >
              Get Started
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="size-4" />
                View on GitHub
              </a>
            </Button>
          </motion.div>
        </div>

        <DashboardMockup />
      </Container>
    </section>
  );
}

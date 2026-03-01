"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Container } from "@/components/shared/container";
import { SectionHeader } from "@/components/shared/section-header";
import { GridBackground } from "@/components/shared/grid-background";
import { cn } from "@/lib/utils";

const tabs = ["Transactions", "Reports", "Accounts"] as const;
type Tab = (typeof tabs)[number];

function TransactionsTab() {
  const rows = [
    { date: "Mar 01", desc: "Client Invoice #1024", debit: "$12,500", credit: "-", balance: "$48,250" },
    { date: "Feb 28", desc: "Office Rent", debit: "-", credit: "$3,200", balance: "$35,750" },
    { date: "Feb 27", desc: "Software Subscription", debit: "-", credit: "$299", balance: "$38,950" },
    { date: "Feb 26", desc: "Consulting Revenue", debit: "$8,000", credit: "-", balance: "$39,249" },
    { date: "Feb 25", desc: "Equipment Purchase", debit: "-", credit: "$1,450", balance: "$31,249" },
  ];

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-5 gap-2 border-b bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
        <span>Date</span>
        <span>Description</span>
        <span className="text-right">Debit</span>
        <span className="text-right">Credit</span>
        <span className="text-right">Balance</span>
      </div>
      {rows.map((row, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: i * 0.08 }}
          className="grid grid-cols-5 gap-2 border-b px-4 py-3 text-sm last:border-0"
        >
          <span className="text-muted-foreground">{row.date}</span>
          <span className="font-medium">{row.desc}</span>
          <span className="text-right text-emerald-600">{row.debit}</span>
          <span className="text-right text-red-500">{row.credit}</span>
          <span className="text-right font-medium">{row.balance}</span>
        </motion.div>
      ))}
    </div>
  );
}

function ReportsTab() {
  const kpis = [
    { label: "Total Revenue", value: "$124,580" },
    { label: "Total Expenses", value: "$68,240" },
    { label: "Net Profit", value: "$56,340" },
  ];

  const chartPoints = "0,80 40,65 80,70 120,45 160,50 200,30 240,35 280,20 320,25 360,15";
  const areaPoints = `0,100 ${chartPoints} 360,100`;

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.1 }}
            className="rounded-lg border p-3"
          >
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="mt-1 text-lg font-bold">{kpi.value}</p>
          </motion.div>
        ))}
      </div>
      <div className="rounded-lg border p-4">
        <p className="mb-3 text-xs font-medium text-muted-foreground">
          Revenue Trend
        </p>
        <svg viewBox="0 0 360 100" className="h-32 w-full">
          <motion.polygon
            points={areaPoints}
            fill="url(#areaGrad)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
          />
          <motion.polyline
            points={chartPoints}
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

function AccountsTab() {
  const tree = [
    {
      name: "Assets",
      balance: "$156,400",
      children: [
        { name: "Cash", balance: "$48,250" },
        { name: "Accounts Receivable", balance: "$67,150" },
        { name: "Equipment", balance: "$41,000" },
      ],
    },
    {
      name: "Liabilities",
      balance: "$42,800",
      children: [
        { name: "Accounts Payable", balance: "$28,300" },
        { name: "Loans", balance: "$14,500" },
      ],
    },
    {
      name: "Equity",
      balance: "$113,600",
      children: [{ name: "Retained Earnings", balance: "$113,600" }],
    },
  ];

  return (
    <div className="space-y-3">
      {tree.map((group, gi) => (
        <motion.div
          key={gi}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: gi * 0.12 }}
          className="rounded-lg border"
        >
          <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2.5">
            <span className="text-sm font-semibold">{group.name}</span>
            <span className="text-sm font-bold">{group.balance}</span>
          </div>
          {group.children.map((child, ci) => (
            <div
              key={ci}
              className="flex items-center justify-between border-b px-4 py-2 pl-8 text-sm last:border-0"
            >
              <span className="text-muted-foreground">{child.name}</span>
              <span className="font-medium">{child.balance}</span>
            </div>
          ))}
        </motion.div>
      ))}
    </div>
  );
}

export function DashboardPreview() {
  const [activeTab, setActiveTab] = useState<Tab>("Transactions");

  return (
    <GridBackground variant="dots">
      <section className="bg-muted/30 py-20 md:py-28">
        <Container>
          <SectionHeader
            badge="Preview"
            title="See it in action"
            subtitle="A full-featured accounting dashboard at your fingertips."
          />

          {/* Tabs */}
          <div className="mb-8 flex justify-center">
            <div className="inline-flex rounded-lg border bg-muted/50 p-1">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "rounded-md px-4 py-2 text-sm font-medium transition-all",
                    activeTab === tab
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Dashboard frame */}
          <div className="mx-auto max-w-4xl overflow-hidden rounded-xl border bg-card shadow-2xl">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <div className="size-3 rounded-full bg-red-400" />
              <div className="size-3 rounded-full bg-yellow-400" />
              <div className="size-3 rounded-full bg-green-400" />
              <span className="ml-3 text-xs text-muted-foreground">
                dubbl — {activeTab}
              </span>
            </div>
            <div className="p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === "Transactions" && <TransactionsTab />}
                  {activeTab === "Reports" && <ReportsTab />}
                  {activeTab === "Accounts" && <AccountsTab />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </Container>
      </section>
    </GridBackground>
  );
}

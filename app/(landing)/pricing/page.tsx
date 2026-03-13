"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Check,
  Minus,
  ArrowRight,
  Mail,
  FileBox,
  Github,
  Sparkles,
  Zap,
} from "lucide-react";
import { GrainGradient } from "@paper-design/shaders-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { cn } from "@/lib/utils";
import { PLAN_LIMITS, PLAN_PRICES } from "@/lib/plans";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmt(v: number): string {
  if (v === Infinity) return "Unlimited";
  return v.toLocaleString();
}

function fmtStorage(mb: number): string {
  if (mb === Infinity) return "Unlimited";
  if (mb >= 1024) return `${mb / 1024} GB`;
  return `${mb} MB`;
}

function fmtAudit(days: number): string {
  if (days === Infinity) return "Unlimited";
  if (days >= 365) return `${Math.floor(days / 365)} year`;
  return `${days} days`;
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const storagePlans = [
  {
    name: "Free",
    files: "5 GB",
    price: 0,
    emails: "100/mo",
    description: "Included with every org",
    example: "Documents, receipts, and invoice attachments",
  },
  {
    name: "Starter",
    files: "25 GB",
    price: 15,
    emails: "500/mo",
    description: "For growing teams",
    example: "Bulk document uploads, years of receipts",
  },
  {
    name: "Growth",
    files: "75 GB",
    price: 45,
    emails: "3,000/mo",
    description: "For established businesses",
    example: "Large file archives with full attachment history",
  },
  {
    name: "Scale",
    files: "300 GB",
    price: 120,
    emails: "10,000/mo",
    description: "For large organizations",
    example: "Enterprise-grade document archival",
  },
];

const comparisonRows = [
  { label: "Organizations", free: fmt(PLAN_LIMITS.free.organizations), pro: fmt(PLAN_LIMITS.pro.organizations) },
  { label: "Team members", free: fmt(PLAN_LIMITS.free.members), pro: fmt(PLAN_LIMITS.pro.members) },
  { label: "Journal entries / month", free: fmt(PLAN_LIMITS.free.entriesPerMonth), pro: fmt(PLAN_LIMITS.pro.entriesPerMonth) },
  { label: "Contacts", free: fmt(PLAN_LIMITS.free.contacts), pro: fmt(PLAN_LIMITS.pro.contacts) },
  { label: "Invoices / month", free: fmt(PLAN_LIMITS.free.invoicesPerMonth), pro: fmt(PLAN_LIMITS.pro.invoicesPerMonth) },
  { label: "Bank accounts", free: fmt(PLAN_LIMITS.free.bankAccounts), pro: fmt(PLAN_LIMITS.pro.bankAccounts) },
  { label: "Projects", free: fmt(PLAN_LIMITS.free.projects), pro: fmt(PLAN_LIMITS.pro.projects) },
  { label: "Storage (included)", free: fmtStorage(PLAN_LIMITS.free.storageMb), pro: fmtStorage(PLAN_LIMITS.pro.storageMb) },
  { label: "Audit log retention", free: fmtAudit(PLAN_LIMITS.free.auditLogDays), pro: fmtAudit(PLAN_LIMITS.pro.auditLogDays) },
];

const featureRows: { label: string; free: boolean; pro: boolean }[] = [
  { label: "Double-entry bookkeeping", free: true, pro: true },
  { label: "Trial balance & general ledger", free: true, pro: true },
  { label: "Balance sheet & income statement", free: false, pro: true },
  { label: "Profit & loss report", free: false, pro: true },
  { label: "Cash flow statement", free: false, pro: true },
  { label: "Aged receivables & payables", free: false, pro: true },
  { label: "Account transaction reports", free: false, pro: true },
  { label: "API access", free: PLAN_LIMITS.free.apiAccess, pro: PLAN_LIMITS.pro.apiAccess },
  { label: "CRM & sales pipeline", free: true, pro: true },
  { label: "Invoicing & billing", free: true, pro: true },
  { label: "Bank reconciliation", free: true, pro: true },
  { label: "Multi-currency support", free: false, pro: true },
  { label: "Community support", free: true, pro: true },
  { label: "Email support", free: false, pro: true },
  { label: "Priority support", free: false, pro: true },
];

/* ------------------------------------------------------------------ */
/*  Small components                                                   */
/* ------------------------------------------------------------------ */

function ComparisonValue({ value }: { value: boolean | string }) {
  if (typeof value === "boolean") {
    return value ? (
      <div className="mx-auto flex size-6 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      </div>
    ) : (
      <Minus className="mx-auto size-4 text-muted-foreground/25" />
    );
  }
  return (
    <span className="font-mono text-sm font-medium tabular-nums text-foreground">
      {value}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <div className="h-px flex-1 bg-gradient-to-r from-emerald-500/40 to-transparent" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
        {children}
      </span>
      <div className="h-px flex-1 bg-gradient-to-l from-emerald-500/40 to-transparent" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PricingPage() {
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");
  const price = (plan: keyof typeof PLAN_PRICES) =>
    interval === "annual" ? PLAN_PRICES[plan].annual : PLAN_PRICES[plan].monthly;

  return (
    <div className="relative">
      <Container className="relative pt-32 pb-24">
        {/* Hero */}
        <motion.div
          className="mx-auto max-w-3xl text-center"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 dark:border-emerald-800 dark:bg-emerald-950">
            <div className="size-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              Transparent pricing
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-5xl font-semibold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
            Start free,{" "}
            <span className="italic bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400 bg-clip-text text-transparent dark:from-emerald-400 dark:via-emerald-300 dark:to-teal-300">
              scale smart
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
            Two simple plans. Storage add-ons when you need them. Self-host for
            free with zero limits.
          </p>

          <div className="relative mt-8 grid grid-cols-2 rounded-full border bg-muted/50 p-1 w-fit mx-auto">
            <motion.div
              className="absolute inset-y-1 w-[calc(50%-2px)] rounded-full bg-background shadow-sm"
              initial={false}
              animate={{ x: interval === "monthly" ? 4 : "calc(100% + 4px)" }}
              transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
            />
            <button
              onClick={() => setInterval("monthly")}
              className={cn(
                "relative z-10 rounded-full px-5 py-2 text-sm font-medium transition-colors",
                interval === "monthly" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval("annual")}
              className={cn(
                "relative z-10 rounded-full px-5 py-2 text-sm font-medium transition-colors",
                interval === "annual" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Annual
              <span className="ml-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Save 17%</span>
            </button>
          </div>
        </motion.div>

        {/* Seat Plans */}
        <motion.div
          className="mt-20"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <SectionLabel>Team plans</SectionLabel>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {/* Free */}
            <div className="group relative flex flex-col rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg hover:shadow-black/5">
              <div className="flex flex-1 flex-col p-8 lg:p-10">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
                    <Sparkles className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Free</h3>
                    <p className="text-xs text-muted-foreground">For individuals</p>
                  </div>
                </div>

                <div className="mt-8 flex items-baseline gap-2">
                  <span className="font-mono text-6xl font-bold tracking-tighter text-foreground">
                    $0
                  </span>
                  <span className="text-sm text-muted-foreground">forever</span>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Everything you need for personal bookkeeping. No credit card, no time limit.
                </p>

                <div className="mt-8 flex-1">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {[
                      `${fmt(PLAN_LIMITS.free.organizations)} organization`,
                      `${fmt(PLAN_LIMITS.free.members)} member (owner)`,
                      `${fmt(PLAN_LIMITS.free.entriesPerMonth)} entries/mo`,
                      `${fmt(PLAN_LIMITS.free.contacts)} contacts`,
                      `${fmt(PLAN_LIMITS.free.invoicesPerMonth)} invoices/mo`,
                      `${fmt(PLAN_LIMITS.free.bankAccounts)} bank account`,
                      `${fmt(PLAN_LIMITS.free.projects)} projects`,
                      "Single currency",
                      "Trial balance & GL",
                      fmtStorage(PLAN_LIMITS.free.storageMb) + " storage",
                      `${fmtAudit(PLAN_LIMITS.free.auditLogDays)} audit log`,
                      "Community support",
                    ].map((f) => (
                      <div key={f} className="flex items-center gap-2 text-[13px]">
                        <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-muted-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-10">
                  <Button variant="outline" className="w-full h-12 text-sm font-medium" asChild>
                    <a href="/sign-up">Get Started Free</a>
                  </Button>
                </div>
              </div>
            </div>

            {/* Pro */}
            <div className="group relative flex flex-col rounded-2xl border-2 border-emerald-500/40 bg-card transition-shadow hover:shadow-lg hover:shadow-emerald-500/10 dark:border-emerald-500/30">
              {/* Badge */}
              <div className="absolute right-6 top-6">
                <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 dark:border-emerald-800 dark:bg-emerald-950">
                  <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Popular
                  </span>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-8 lg:p-10">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950">
                    <Zap className="size-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Pro</h3>
                    <p className="text-xs text-muted-foreground">For teams</p>
                  </div>
                </div>

                <div className="mt-8 flex items-baseline gap-2">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={interval}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="font-mono text-6xl font-bold tracking-tighter text-foreground"
                    >
                      ${price("pro")}
                    </motion.span>
                  </AnimatePresence>
                  <span className="text-sm text-muted-foreground">/seat/mo</span>
                  {interval === "annual" && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-muted-foreground line-through"
                    >
                      ${PLAN_PRICES.pro.monthly}
                    </motion.span>
                  )}
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={interval}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="mt-1 text-xs text-muted-foreground/70"
                  >
                    {interval === "annual" ? `Billed as $${price("pro") * 12}/seat/year` : "Billed monthly per seat"}
                  </motion.p>
                </AnimatePresence>

                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Advanced reports, API access, multi-currency, and team collaboration.
                </p>

                <div className="mt-8 flex-1">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {[
                      `${fmt(PLAN_LIMITS.pro.organizations)} organizations`,
                      `Up to ${fmt(PLAN_LIMITS.pro.members)} members`,
                      "Unlimited entries",
                      "Unlimited contacts",
                      `${fmt(PLAN_LIMITS.pro.invoicesPerMonth)} invoices/mo`,
                      `${fmt(PLAN_LIMITS.pro.bankAccounts)} bank accounts`,
                      `${fmt(PLAN_LIMITS.pro.projects)} projects`,
                      "All standard reports",
                      fmtStorage(PLAN_LIMITS.pro.storageMb) + " storage",
                      `${fmtAudit(PLAN_LIMITS.pro.auditLogDays)} audit log`,
                      "Full API access",
                      "Multi-currency",
                      "Priority support",
                    ].map((f) => (
                      <div key={f} className="flex items-center gap-2 text-[13px]">
                        <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-muted-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-10">
                  <Button
                    className="w-full h-12 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                    asChild
                  >
                    <a href="/sign-up?plan=pro">
                      Start Free Trial
                      <ArrowRight className="ml-1.5 size-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Storage Add-ons */}
        <motion.div
          className="mt-32"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
        >
          <SectionLabel>Storage &amp; Emails</SectionLabel>

          <div className="mt-4 mx-auto max-w-2xl text-center">
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
              Add storage as you grow
            </h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              File storage for documents, receipts, and attachments. Customer
              emails for invoices and reminders. Unlimited transactions and
              records. Upgrade independently from your team plan.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {storagePlans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.08 }}
                className="group relative flex flex-col rounded-2xl border border-border bg-card transition-all hover:shadow-lg hover:shadow-black/5 hover:border-emerald-500/30"
              >
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{plan.name}</h3>
                    {i === 0 && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Included
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-baseline gap-1">
                    {plan.price === 0 ? (
                      <span className="font-mono text-3xl font-bold tracking-tighter">$0</span>
                    ) : (
                      <>
                        <span className="font-mono text-3xl font-bold tracking-tighter">
                          ${plan.price}
                        </span>
                        <span className="text-xs text-muted-foreground">/mo</span>
                      </>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">{plan.description}</p>

                  {/* Stats */}
                  <div className="mt-5 space-y-3 flex-1">
                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <FileBox className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs text-muted-foreground">Files</span>
                      </div>
                      <span className="font-mono text-sm font-semibold tabular-nums">{plan.files}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Mail className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs text-muted-foreground">Emails</span>
                      </div>
                      <span className="font-mono text-sm font-semibold tabular-nums">{plan.emails}</span>
                    </div>

                    <p className="text-[11px] leading-relaxed text-muted-foreground/70 px-1">
                      {plan.example}
                    </p>
                  </div>

                  <div className="mt-6">
                    {i === 0 ? (
                      <Button variant="outline" size="sm" className="w-full text-xs" disabled>
                        Included
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs group-hover:border-emerald-500/40 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors"
                        asChild
                      >
                        <a href="/sign-up">Add {plan.name}</a>
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Self-hosting callout */}
        <motion.div
          className="mt-20"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
        >
          <div className="rounded-2xl border border-border bg-muted/30 px-8 py-8 lg:px-12">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Github className="size-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Open Source
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-foreground">
                  Self-host with zero limits
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  dubbl is Apache 2.0 licensed. Self-hosted instances unlock
                  every feature with no user caps and no telemetry. Cloud plans
                  fund development.
                </p>
              </div>
              <Button
                variant="outline"
                asChild
              >
                <a
                  href="https://github.com/dubbl-org/dubbl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="mr-2 size-4" />
                  View on GitHub
                </a>
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Comparison Table */}
        <motion.div
          className="mt-32"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <SectionLabel>Compare</SectionLabel>

          <div className="mt-4 mx-auto max-w-2xl text-center mb-12">
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
              Every detail, side by side
            </h2>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="py-4 pl-6 pr-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground w-[55%]">
                    Feature
                  </th>
                  <th className="py-4 text-center w-[22.5%]">
                    <span className="text-sm font-semibold text-foreground">Free</span>
                  </th>
                  <th className="py-4 pr-6 text-center w-[22.5%]">
                    <div className="inline-flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        Pro
                      </span>
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                        ${price("pro")}/seat
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Limits */}
                <tr>
                  <td
                    colSpan={3}
                    className="px-6 pb-1 pt-6 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400"
                  >
                    Limits
                  </td>
                </tr>
                {comparisonRows.map((row, i) => (
                  <tr
                    key={row.label}
                    className={cn(
                      "transition-colors hover:bg-muted/30",
                      i < comparisonRows.length - 1 && "border-b border-border/40"
                    )}
                  >
                    <td className="py-3 pl-6 pr-4 text-sm text-foreground">{row.label}</td>
                    <td className="py-3 text-center">
                      <ComparisonValue value={row.free} />
                    </td>
                    <td className="py-3 pr-6 text-center">
                      <ComparisonValue value={row.pro} />
                    </td>
                  </tr>
                ))}

                {/* Features & Support */}
                <tr>
                  <td
                    colSpan={3}
                    className="px-6 pb-1 pt-6 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400"
                  >
                    Features &amp; Support
                  </td>
                </tr>
                {featureRows.map((row, i) => (
                  <tr
                    key={row.label}
                    className={cn(
                      "transition-colors hover:bg-muted/30",
                      i < featureRows.length - 1 && "border-b border-border/40"
                    )}
                  >
                    <td className="py-3 pl-6 pr-4 text-sm text-foreground">{row.label}</td>
                    <td className="py-3 text-center">
                      <ComparisonValue value={row.free} />
                    </td>
                    <td className="py-3 pr-6 text-center">
                      <ComparisonValue value={row.pro} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* FAQ */}
        <motion.div
          className="mt-32"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
        >
          <SectionLabel>FAQ</SectionLabel>

          <div className="mt-4 mx-auto max-w-2xl text-center mb-12">
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
              Common questions
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                q: "Can I switch plans?",
                a: "Yes. Upgrade or downgrade at any time. Upgrades are prorated, downgrades take effect at the end of your billing period.",
              },
              {
                q: "What if I exceed limits?",
                a: "We won't cut you off. You'll get a notification and a grace period to upgrade or reduce usage.",
              },
              {
                q: "Annual billing?",
                a: "Yes. Pay for 10 months, get 12. Switch to annual in your billing settings at any time.",
              },
              {
                q: "Is self-hosting really free?",
                a: "Yes. Apache 2.0 licensed. No feature limits, no user caps, no telemetry. Ever.",
              },
              {
                q: "Can I add storage separately?",
                a: "Yes. Storage add-ons are independent. You can use the Free team plan with any storage tier.",
              },
              {
                q: "How does seat pricing work?",
                a: "Every member counts as a seat. Pro is $12/seat/month or $10/seat/month billed annually.",
              },
            ].map((faq, i) => (
              <motion.div
                key={faq.q}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.5 + i * 0.06 }}
                className="rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-lg hover:shadow-black/5"
              >
                <h3 className="text-sm font-semibold text-foreground">{faq.q}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {faq.a}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          className="mt-32"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 px-8 py-16 text-center lg:px-16 lg:py-20">
            <GrainGradient
              className="pointer-events-none !absolute !inset-0 !rounded-none"
              width="100%"
              height="100%"
              colors={["#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#34d399", "#a7f3d0"]}
              colorBack="#10b981"
              softness={1}
              intensity={0.8}
              noise={0.9}
              shape="wave"
              scale={3.5}
              speed={0.2}
            />

            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
                Start managing your books today
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/60">
                Self-host in minutes, extend via API, and own your financial
                data. Forever free.
              </p>
              <p className="mt-6 text-sm text-white/40">
                Open source &middot; Self-hostable &middot; Free forever
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/sign-up"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-8 text-sm font-medium text-emerald-700 transition-colors hover:bg-white/90"
                >
                  Get Started
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/20 px-8 text-sm font-medium text-white transition-colors hover:bg-white/5"
                >
                  Contact Sales
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </Container>
    </div>
  );
}

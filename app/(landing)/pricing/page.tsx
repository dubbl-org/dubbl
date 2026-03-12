"use client";

import { motion } from "motion/react";
import {
  Check,
  Minus,
  ArrowRight,
  Mail,
  Database,
  FileBox,
  Github,
  Sparkles,
  Zap,
} from "lucide-react";
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
    files: "2 GB",
    db: "500 MB",
    price: 0,
    emails: "100/mo",
    description: "Included with every org",
    example: "~10,000 transactions, 200 invoices with attachments",
  },
  {
    name: "Starter",
    files: "20 GB",
    db: "3 GB",
    price: 15,
    emails: "500/mo",
    description: "For growing teams",
    example: "~75k transactions, bulk document uploads",
  },
  {
    name: "Growth",
    files: "60 GB",
    db: "15 GB",
    price: 45,
    emails: "3,000/mo",
    description: "For established businesses",
    example: "~400k transactions, years of history with attachments",
  },
  {
    name: "Scale",
    files: "250 GB",
    db: "60 GB",
    price: 120,
    emails: "10,000/mo",
    description: "For large organizations",
    example: "1.5M+ transactions, enterprise-grade archival",
  },
];

const comparisonRows = [
  { label: "Organizations", free: fmt(PLAN_LIMITS.free.organizations), pro: fmt(PLAN_LIMITS.pro.organizations) },
  { label: "Team members", free: fmt(PLAN_LIMITS.free.members), pro: fmt(PLAN_LIMITS.pro.members) },
  { label: "Journal entries / month", free: fmt(PLAN_LIMITS.free.entriesPerMonth), pro: fmt(PLAN_LIMITS.pro.entriesPerMonth) },
  { label: "Currencies", free: fmt(PLAN_LIMITS.free.currencies), pro: fmt(PLAN_LIMITS.pro.currencies) },
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
  return (
    <div className="relative overflow-hidden">
      {/* ─── Background ─── */}
      <div className="pointer-events-none absolute inset-0">
        {/* Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#10b98112_1px,transparent_1px),linear-gradient(to_bottom,#10b98112_1px,transparent_1px)] bg-[size:48px_48px] dark:bg-[linear-gradient(to_right,#10b98106_1px,transparent_1px),linear-gradient(to_bottom,#10b98106_1px,transparent_1px)]" />

        {/* Radial glows */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_30%,rgba(16,185,129,0.08),transparent_70%)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_30%,rgba(16,185,129,0.04),transparent_70%)]" />

        {/* Secondary glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_70%_60%,rgba(16,185,129,0.05),transparent)] dark:bg-[radial-gradient(ellipse_40%_30%_at_70%_60%,rgba(16,185,129,0.03),transparent)]" />

        {/* Edge fades */}
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-background to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </div>

      <Container className="relative pt-32 pb-24">
        {/* ─── Hero ─── */}
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
        </motion.div>

        {/* ─── Seat Plans ─── */}
        <motion.div
          className="mt-20"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <SectionLabel>Team plans</SectionLabel>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {/* ── Free ── */}
            <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg hover:shadow-black/5">
              {/* Top accent */}
              <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

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
                    ${PLAN_PRICES.free}
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
                      `${fmt(PLAN_LIMITS.free.currencies)} currency`,
                      `${fmt(PLAN_LIMITS.free.contacts)} contacts`,
                      `${fmt(PLAN_LIMITS.free.invoicesPerMonth)} invoices/mo`,
                      `${fmt(PLAN_LIMITS.free.bankAccounts)} bank account`,
                      `${fmt(PLAN_LIMITS.free.projects)} projects`,
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

            {/* ── Pro ── */}
            <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950 to-[#0a0d0b] text-emerald-50 shadow-2xl shadow-emerald-950/30 transition-shadow hover:shadow-emerald-950/50 dark:border-emerald-500/20">
              {/* Top accent glow */}
              <div className="h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />

              {/* Badge */}
              <div className="absolute right-6 top-6">
                <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1">
                  <div className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                    Popular
                  </span>
                </div>
              </div>

              {/* Background decoration */}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_70%_-10%,rgba(16,185,129,0.15),transparent)]" />
              <div className="pointer-events-none absolute inset-0 blueprint-hash opacity-[0.03]" />

              <div className="relative flex flex-1 flex-col p-8 lg:p-10">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/20">
                    <Zap className="size-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Pro</h3>
                    <p className="text-xs text-emerald-300/70">For teams</p>
                  </div>
                </div>

                <div className="mt-8 flex items-baseline gap-2">
                  <span className="font-mono text-6xl font-bold tracking-tighter text-white">
                    ${PLAN_PRICES.pro}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm text-emerald-300/70">/seat/mo</span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-emerald-300/50">
                  1st member free, then ${PLAN_PRICES.pro}/additional seat
                </p>

                <p className="mt-4 text-sm leading-relaxed text-emerald-100/70">
                  Advanced reports, API access, multi-currency, and team collaboration.
                </p>

                <div className="mt-8 flex-1">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {[
                      `${fmt(PLAN_LIMITS.pro.organizations)} organizations`,
                      `Up to ${fmt(PLAN_LIMITS.pro.members)} members`,
                      "Unlimited entries",
                      `${fmt(PLAN_LIMITS.pro.currencies)} currencies`,
                      `${fmt(PLAN_LIMITS.pro.contacts)} contacts`,
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
                        <Check className="size-3.5 shrink-0 text-emerald-400" />
                        <span className="text-emerald-100/80">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-10">
                  <Button
                    className="w-full h-12 text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/25 transition-all"
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

        {/* ─── Storage Add-ons ─── */}
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
              File storage for documents and receipts. Database storage for
              transactions and records. Customer emails for invoices and
              reminders. Upgrade independently from your team plan.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {storagePlans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + i * 0.08 }}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-all hover:shadow-lg hover:shadow-black/5",
                  i === 0
                    ? "border-border"
                    : "border-border hover:border-emerald-500/30"
                )}
              >
                {/* Top line */}
                <div
                  className={cn(
                    "h-px",
                    i === 0
                      ? "bg-gradient-to-r from-transparent via-border to-transparent"
                      : "bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent"
                  )}
                />

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
                        <Database className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs text-muted-foreground">Database</span>
                      </div>
                      <span className="font-mono text-sm font-semibold tabular-nums">{plan.db}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Mail className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs text-muted-foreground">Emails</span>
                      </div>
                      <span className="font-mono text-sm font-semibold tabular-nums">{plan.emails}</span>
                    </div>

                    {/* Example callout */}
                    <div className="relative rounded-lg border border-dashed border-border px-3 py-2.5">
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {plan.example}
                      </p>
                    </div>
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

        {/* ─── Self-hosting callout ─── */}
        <motion.div
          className="mt-20"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
        >
          <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950 to-[#0a0d0b] px-8 py-8 lg:px-12">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_80%_at_20%_50%,rgba(16,185,129,0.1),transparent)]" />
            <div className="pointer-events-none absolute inset-0 blueprint-hash opacity-[0.04]" />

            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Github className="size-5 text-emerald-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    Open Source
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-white">
                  Self-host with zero limits
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-emerald-100/60">
                  dubbl is Apache 2.0 licensed. Self-hosted instances unlock
                  every feature with no user caps and no telemetry. Cloud plans
                  fund development.
                </p>
              </div>
              <Button
                variant="outline"
                className="shrink-0 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-100 hover:border-emerald-500/50"
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

        {/* ─── Comparison Table ─── */}
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
                        ${PLAN_PRICES.pro}/seat
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

        {/* ─── FAQ ─── */}
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
                a: "First member is always free. On Pro, each additional team member is $12/month.",
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

        {/* ─── Bottom CTA ─── */}
        <motion.div
          className="mt-32"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <div className="relative overflow-hidden rounded-2xl bg-[#0a0a0a] px-8 py-16 text-center lg:px-16 lg:py-20">
            {/* Decorations */}
            <div className="pointer-events-none absolute inset-0 blueprint-hash opacity-[0.04]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(16,185,129,0.08),transparent)]" />

            {/* Corner dashes */}
            <div className="pointer-events-none absolute left-6 top-6 size-16 rounded-lg border border-dashed border-emerald-500/20" />
            <div className="pointer-events-none absolute right-6 bottom-6 size-16 rounded-lg border border-dashed border-emerald-500/20" />

            <div className="relative">
              <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-white sm:text-4xl lg:text-5xl">
                Ready to get started?
              </h2>
              <p className="mx-auto mt-4 max-w-md text-emerald-100/60">
                Join teams using dubbl for modern double-entry bookkeeping.
                Start free, upgrade when you need more.
              </p>
              <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Button
                  size="lg"
                  className="h-13 px-8 bg-emerald-500 text-white hover:bg-emerald-400 shadow-lg shadow-emerald-500/25 transition-all font-semibold"
                  asChild
                >
                  <a href="/sign-up">
                    Start for Free
                    <ArrowRight className="ml-2 size-4" />
                  </a>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-13 px-8 border-white/20 text-white hover:bg-white/10 hover:border-white/30"
                  asChild
                >
                  <a href="/contact">Talk to Sales</a>
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </Container>
    </div>
  );
}

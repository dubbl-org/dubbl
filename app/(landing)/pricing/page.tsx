import { Check, Minus, Users, HardDrive, ArrowRight, Mail, Database, FileBox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PLAN_LIMITS, PLAN_PRICES } from "@/lib/plans";

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

const storagePlans = [
  {
    name: "Free",
    files: "2 GB",
    db: "500 MB",
    price: 0,
    emails: "100/mo",
    description: "Included with every organization",
    example: "~10,000 transactions, 200 invoices with attachments",
  },
  {
    name: "Starter",
    files: "20 GB",
    db: "3 GB",
    price: 15,
    emails: "500/mo",
    description: "For growing teams with more data",
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

function ComparisonValue({ value }: { value: boolean | string }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="mx-auto size-4 text-emerald-600 dark:text-emerald-400" />
    ) : (
      <Minus className="mx-auto size-4 text-muted-foreground/30" />
    );
  }
  return <span className="text-sm font-medium text-foreground">{value}</span>;
}

export default function PricingPage() {
  return (
    <div className="pt-32 pb-20">
      <Container>
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <Badge
            variant="secondary"
            className="mb-4 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
          >
            Pricing
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free, upgrade when you need more. Add storage independently.
            Self-host for free with no limits.
          </p>
        </div>

        {/* ─── Seat Plans ─── */}
        <div className="mt-20">
          <div className="flex items-center gap-2.5 mb-8">
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950">
              <Users className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-xl font-semibold">Team plans</h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Free plan */}
            <div className="relative flex flex-col rounded-2xl border border-border bg-card p-8 lg:p-10">
              <div>
                <h3 className="text-lg font-semibold">Free</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  For individuals and personal bookkeeping. Everything you need to get started.
                </p>
              </div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tight">${PLAN_PRICES.free}</span>
                <span className="ml-2 text-sm text-muted-foreground">forever</span>
              </div>
              <div className="mt-8 flex-1">
                <ul className="grid gap-3 sm:grid-cols-2">
                  {[
                    `${fmt(PLAN_LIMITS.free.organizations)} organization`,
                    `${fmt(PLAN_LIMITS.free.members)} team members`,
                    `${fmt(PLAN_LIMITS.free.entriesPerMonth)} entries/month`,
                    `${fmt(PLAN_LIMITS.free.currencies)} currency`,
                    `${fmt(PLAN_LIMITS.free.contacts)} contacts`,
                    `${fmt(PLAN_LIMITS.free.invoicesPerMonth)} invoices/month`,
                    `${fmt(PLAN_LIMITS.free.bankAccounts)} bank account`,
                    `${fmt(PLAN_LIMITS.free.projects)} projects`,
                    "Trial balance & GL reports",
                    fmtStorage(PLAN_LIMITS.free.storageMb) + " included storage",
                    `${fmtAudit(PLAN_LIMITS.free.auditLogDays)} audit log`,
                    "Community support",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10">
                <Button variant="outline" className="w-full h-11" asChild>
                  <a href="/sign-up">Get Started</a>
                </Button>
              </div>
            </div>

            {/* Pro plan */}
            <div className="relative flex flex-col rounded-2xl border border-emerald-500/50 bg-card p-8 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/20 lg:p-10">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-emerald-600 px-4 py-1 text-xs font-semibold text-white shadow-sm">
                  Most Popular
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold">Pro</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  For teams that need collaboration, advanced reports, and API access.
                </p>
              </div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-5xl font-bold tracking-tight">${PLAN_PRICES.pro}</span>
                <span className="text-sm text-muted-foreground">/seat/month</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                First member free. Additional seats ${PLAN_PRICES.pro} each.
              </p>
              <div className="mt-8 flex-1">
                <ul className="grid gap-3 sm:grid-cols-2">
                  {[
                    `${fmt(PLAN_LIMITS.pro.organizations)} organizations`,
                    `Up to ${fmt(PLAN_LIMITS.pro.members)} team members`,
                    "Unlimited entries",
                    `${fmt(PLAN_LIMITS.pro.currencies)} currencies`,
                    `${fmt(PLAN_LIMITS.pro.contacts)} contacts`,
                    `${fmt(PLAN_LIMITS.pro.invoicesPerMonth)} invoices/month`,
                    `${fmt(PLAN_LIMITS.pro.bankAccounts)} bank accounts`,
                    `${fmt(PLAN_LIMITS.pro.projects)} projects`,
                    "All standard reports",
                    fmtStorage(PLAN_LIMITS.pro.storageMb) + " included storage",
                    `${fmtAudit(PLAN_LIMITS.pro.auditLogDays)} audit log`,
                    "Full API access",
                    "Multi-currency support",
                    "Priority email support",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10">
                <Button className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 shadow-sm" asChild>
                  <a href="/sign-up?plan=pro">
                    Start Free Trial
                    <ArrowRight className="ml-1.5 size-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Storage Add-ons ─── */}
        <div className="mt-24">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950">
              <HardDrive className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-xl font-semibold">Storage add-ons</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-8 max-w-2xl">
            Storage is split into file storage (documents, attachments, receipts) and
            database storage (transactions, contacts, invoices). Each plan also includes
            outbound customer emails for invoices, reminders, and notifications.
            Upgrade independently from your team plan.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {storagePlans.map((plan, i) => (
              <div
                key={plan.name}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-card p-6 transition-shadow hover:shadow-sm",
                  "border-border"
                )}
              >
                {i === 0 && (
                  <div className="absolute -top-2.5 right-4">
                    <span className="rounded-full bg-muted px-3 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Included
                    </span>
                  </div>
                )}
                <h3 className="text-sm font-semibold">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  {plan.price === 0 ? (
                    <span className="text-sm text-muted-foreground">Free</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold tracking-tight">${plan.price}</span>
                      <span className="text-xs text-muted-foreground">/month</span>
                    </>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {plan.description}
                </p>

                <div className="mt-4 space-y-2.5 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <FileBox className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{plan.files}</span>
                    <span className="text-xs text-muted-foreground">files</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Database className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{plan.db}</span>
                    <span className="text-xs text-muted-foreground">database</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{plan.emails}</span>
                    <span className="text-xs text-muted-foreground">customer emails</span>
                  </div>
                  <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {plan.example}
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  {i === 0 ? (
                    <Button variant="outline" size="sm" className="w-full text-xs" disabled>
                      Included
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      asChild
                    >
                      <a href="/sign-up">Get {plan.name}</a>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Self-hosting callout */}
        <div className="mt-16 rounded-2xl border border-dashed border-emerald-500/30 bg-emerald-50/50 px-8 py-6 dark:bg-emerald-950/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold">Self-hosting? Everything is free.</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                dubbl is open source under Apache 2.0. Self-hosted instances have no feature
                limitations, no user caps, and no telemetry. The cloud plans fund open source development.
              </p>
            </div>
            <Button variant="outline" className="shrink-0" asChild>
              <a href="https://github.com/dubbl-org/dubbl" target="_blank" rel="noopener noreferrer">
                View on GitHub
              </a>
            </Button>
          </div>
        </div>

        {/* ─── Full Comparison Table ─── */}
        <div className="mt-24">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Compare plans in detail
            </h2>
            <p className="mt-3 text-muted-foreground">
              See exactly what you get with each plan.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-4 pr-4 text-left text-sm font-medium text-muted-foreground w-[60%]" />
                  <th className="pb-4 text-center text-sm font-semibold text-foreground w-[20%]">
                    Free
                  </th>
                  <th className="pb-4 text-center text-sm font-semibold text-emerald-600 dark:text-emerald-400 w-[20%]">
                    Pro
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Limits section */}
                <tr>
                  <td colSpan={3} className="pb-2 pt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Limits
                  </td>
                </tr>
                {comparisonRows.map((row) => (
                  <tr key={row.label} className="border-b border-border/50">
                    <td className="py-3.5 pr-4 text-sm text-foreground">{row.label}</td>
                    <td className="py-3.5 text-center">
                      <ComparisonValue value={row.free} />
                    </td>
                    <td className="py-3.5 text-center">
                      <ComparisonValue value={row.pro} />
                    </td>
                  </tr>
                ))}

                {/* Features section */}
                <tr>
                  <td colSpan={3} className="pb-2 pt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Features & Support
                  </td>
                </tr>
                {featureRows.map((row) => (
                  <tr key={row.label} className="border-b border-border/50">
                    <td className="py-3.5 pr-4 text-sm text-foreground">{row.label}</td>
                    <td className="py-3.5 text-center">
                      <ComparisonValue value={row.free} />
                    </td>
                    <td className="py-3.5 text-center">
                      <ComparisonValue value={row.pro} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─── FAQ ─── */}
        <div className="mt-24">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Frequently asked questions
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {[
              {
                q: "Can I switch plans later?",
                a: "Yes. Upgrade or downgrade at any time. Upgrades are prorated. Downgrades take effect at the end of your billing period.",
              },
              {
                q: "What happens if I exceed limits?",
                a: "We won't cut you off. You'll get a notification and a grace period to upgrade or reduce usage.",
              },
              {
                q: "Do you offer annual billing?",
                a: "Yes. Annual billing gives you 2 months free — pay for 10, get 12. Switch in your billing settings.",
              },
              {
                q: "Is self-hosting really free?",
                a: "Yes. dubbl is Apache 2.0 licensed. Self-hosted instances have zero limitations. Cloud plans fund development.",
              },
              {
                q: "Can I add storage separately?",
                a: "Yes. Storage plans are independent add-ons. You can be on the Free team plan and still upgrade your storage.",
              },
              {
                q: "How does seat pricing work?",
                a: "Your first member is always free. On the Pro plan, each additional team member costs $12/month.",
              },
            ].map((faq) => (
              <div key={faq.q} className="rounded-xl border border-border bg-card px-6 py-5">
                <h3 className="font-semibold text-foreground">{faq.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Bottom CTA ─── */}
        <div className="mt-24 rounded-2xl border bg-card px-8 py-14 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to get started?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Join teams using dubbl for modern bookkeeping. Start free, upgrade when you need more.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700" asChild>
              <a href="/sign-up">
                Start for Free
                <ArrowRight className="ml-1.5 size-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="/contact">Talk to Sales</a>
            </Button>
          </div>
        </div>
      </Container>
    </div>
  );
}

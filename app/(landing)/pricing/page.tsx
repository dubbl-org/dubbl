"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PAID_PLANS,
  PLAN_INFO,
  PLAN_LIMITS,
  PLAN_ORDER,
  PLAN_PRICES,
  annualSaving,
  type PlanLimits,
  type PlanName,
} from "@/lib/plans";
import { Eyebrow, Heading, Painting, Section } from "@/components/landing/ledger";
import { backdrops, type Backdrop } from "@/components/landing/backdrops";
import { CurrencyMock, FreeBill, GroupMock, TeamMock } from "@/components/landing/pricing-mockups";
import { Live } from "@/components/landing/stage";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type Interval = "monthly" | "annual";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmt(v: number): string {
  if (v === Infinity) return "Unlimited";
  return v.toLocaleString("en-US");
}

function fmtStorage(mb: number): string {
  if (mb === Infinity) return "Unlimited";
  if (mb >= 1024) return `${(mb / 1024).toLocaleString("en-US")} GB`;
  return `${mb} MB`;
}

function fmtDays(days: number): string {
  if (days === Infinity) return "Unlimited";
  if (days >= 365) {
    const years = Math.round(days / 365);
    return `${years} year${years === 1 ? "" : "s"}`;
  }
  return `${days} days`;
}

const maxSaving = Math.max(...PAID_PLANS.map(annualSaving));

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const POPULAR: PlanName = "standard";

/** Three things that set each plan apart; the table has the rest. */
const highlights: Record<PlanName, string[]> = {
  free: ["1 user", `${PLAN_LIMITS.free.bankAccounts} bank accounts`, `Payroll for ${PLAN_LIMITS.free.employees}`],
  standard: ["Unlimited users", "Multi-currency", `Payroll for ${PLAN_LIMITS.standard.employees}`],
  premium: [`Consolidate ${PLAN_LIMITS.premium.consolidationEntities} entities`, `Payroll for ${PLAN_LIMITS.premium.employees}`, `${fmtStorage(PLAN_LIMITS.premium.storageMb)} storage`],
  ultimate: ["Unlimited entities", "Unlimited payroll", `${fmtStorage(PLAN_LIMITS.ultimate.storageMb)} storage`],
};

type Cell = { plan: string; title: string; label: string; backdrop: Backdrop; mock: React.ReactNode; scale: string; span: string };

/** What each plan unlocks, shown rather than listed. */
const cells: Cell[] = [
  {
    plan: "Free",
    title: "The whole app, free.",
    label: "The free plan as a bill: invoices, entries, reports, bank feeds, payroll and API access, each at $0.00",
    backdrop: backdrops.ridgeline,
    mock: <FreeBill />,
    scale: "scale-[0.62] sm:scale-[0.78]",
    span: "lg:col-span-7",
  },
  {
    plan: "Standard",
    title: "Everyone, one price.",
    label: "A members list growing to six people while the Standard plan stays at $15 a month",
    backdrop: backdrops.birchGold,
    mock: <TeamMock />,
    scale: "scale-[0.78] sm:scale-100",
    span: "lg:col-span-5",
  },
  {
    plan: "Standard",
    title: "Any currency.",
    label: "Invoices in euros, dollars and yen, each converted to pounds",
    backdrop: backdrops.savanna,
    mock: <CurrencyMock />,
    scale: "scale-[0.74] sm:scale-100",
    span: "lg:col-span-5",
  },
  {
    plan: "Premium",
    title: "Your whole group.",
    label: "Three entities in three currencies consolidated into one balanced group profit",
    backdrop: backdrops.redRanges,
    mock: <GroupMock />,
    scale: "scale-[0.66] sm:scale-100",
    span: "lg:col-span-7",
  },
];

type Row = { label: string; value: (l: PlanLimits, plan: PlanName) => string | boolean };

const rows: Row[] = [
  { label: "Users", value: (l) => fmt(l.members) },
  { label: "Payroll employees", value: (l) => fmt(l.employees) },
  { label: "Bank accounts", value: (l) => fmt(l.bankAccounts) },
  { label: "Projects", value: (l) => fmt(l.projects) },
  { label: "Multi-currency", value: (l) => l.multiCurrency },
  { label: "Consolidation", value: (l) => (l.consolidationEntities === 0 ? false : fmt(l.consolidationEntities)) },
  { label: "Storage", value: (l) => fmtStorage(l.storageMb) },
  { label: "Emails / month", value: (l) => fmt(l.emailsPerMonth) },
  { label: "Audit history", value: (l) => fmtDays(l.auditLogDays) },
  { label: "Backups kept", value: (l) => fmtDays(l.backupRetentionDays) },
  {
    label: "Support",
    value: (_, p) => ({ free: "Community", standard: "Email", premium: "Priority", ultimate: "Priority" })[p],
  },
];

const faqs = [
  { q: "Do you charge per user?", a: "No. One price per organization, with unlimited users on every paid plan." },
  { q: "What if I hit a limit?", a: "Nothing is locked or deleted. Adding more of that one thing waits until you upgrade." },
  { q: "Can I switch plans?", a: "Any time. Upgrades are immediate and prorated." },
  { q: "Is self-hosting free?", a: "Yes. Every feature, no limits, Apache 2.0." },
];

/* ------------------------------------------------------------------ */
/*  Small components                                                   */
/* ------------------------------------------------------------------ */

function Value({ value }: { value: boolean | string }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="size-4 text-foreground" strokeWidth={1.75} aria-label="Included" />
    ) : (
      <Minus className="size-4 text-muted-foreground/40" strokeWidth={1.75} aria-label="Not included" />
    );
  }
  return (
    <span className={cn("text-[13px] tabular-nums", value === "Unlimited" ? "text-muted-foreground" : "font-mono text-foreground")}>
      {value}
    </span>
  );
}

function IntervalToggle({ value, onChange }: { value: Interval; onChange: (v: Interval) => void }) {
  return (
    <div role="radiogroup" aria-label="Billing interval" className="inline-flex rounded-full border border-border p-1">
      {(["monthly", "annual"] as const).map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-full px-4 py-1.5 text-[13px] font-medium capitalize transition-colors",
            value === v ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {v}
          {v === "annual" && <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">−{maxSaving}%</span>}
        </button>
      ))}
    </div>
  );
}

function PlanCard({ plan, interval, className }: { plan: PlanName; interval: Interval; className?: string }) {
  const info = PLAN_INFO[plan];
  const prices = PLAN_PRICES[plan];
  const paid = plan !== "free";
  const price = interval === "annual" ? prices.annual : prices.monthly;
  const popular = plan === POPULAR;
  const href = paid ? `/sign-up?plan=${plan}&interval=${interval}` : "/sign-up";

  return (
    <div className={cn("flex flex-col px-5 py-10 sm:px-8 lg:py-12 xl:px-10", popular && "bg-muted/40", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.03em] text-foreground">{info.name}</h2>
        {popular && (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">Most popular</span>
        )}
      </div>
      <div className="mt-8 flex items-baseline gap-2">
        <span className="text-5xl font-semibold tracking-[-0.06em] tabular-nums text-foreground">${price}</span>
        <span className="text-[13px] text-muted-foreground">{paid ? "/ month" : "forever"}</span>
      </div>
      <p className="mt-2 h-4 font-mono text-[11px] text-muted-foreground">
        {!paid ? "No card needed" : interval === "annual" ? "Billed yearly" : "Billed monthly"}
      </p>

      <Link
        href={href}
        className={cn(
          "group mt-8 inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors",
          popular
            ? "bg-primary text-primary-foreground hover:bg-primary/85"
            : "border border-border bg-background text-foreground hover:bg-accent"
        )}
      >
        {paid ? `Choose ${info.name}` : "Start free"}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>

      <ul className="mt-8 space-y-2.5">
        {highlights[plan].map((h) => (
          <li key={h} className="flex items-start gap-2.5 text-[13px] leading-snug text-foreground">
            <Check className="mt-px size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
            {h}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BentoCell({ c }: { c: Cell }) {
  return (
    <div className={c.span}>
      <Live className="relative isolate h-[380px] overflow-hidden rounded-xl sm:h-[460px]">
        <Painting backdrop={c.backdrop} sizes="(min-width: 1024px) 45vw, 100vw" />
        <div role="img" aria-label={c.label} className="absolute inset-0 flex items-center justify-center">
          <div aria-hidden className={cn("pointer-events-none shrink-0 select-none", c.scale)}>
            {c.mock}
          </div>
        </div>
      </Live>
      <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{c.plan}</p>
      <h3 className="mt-1.5 text-[17px] font-semibold tracking-[-0.025em] text-foreground">{c.title}</h3>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PricingPage() {
  const [interval, setInterval] = useState<Interval>("annual");

  return (
    <>
      {/* Hero */}
      <Section rule={false} className="pb-16 pt-20 lg:pb-20 lg:pt-28">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow>Pricing</Eyebrow>
            <Heading as="h1" lead="Start free." className="mt-6 max-w-[14ch]">
              No per-user fees.
            </Heading>
          </div>
          <IntervalToggle value={interval} onChange={setInterval} />
        </div>
      </Section>

      {/* Plans */}
      <Section id="plans" className="px-0 sm:px-0 lg:px-0">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          {PLAN_ORDER.map((plan, i) => (
            <PlanCard
              key={plan}
              plan={plan}
              interval={interval}
              className={cn(
                "border-border",
                i > 0 && "border-t",
                i === 1 && "sm:border-l sm:border-t-0",
                i === 3 && "sm:border-l",
                i > 0 && "xl:border-l xl:border-t-0"
              )}
            />
          ))}
        </div>

        {/* Enterprise */}
        <div className="flex flex-col gap-5 border-t border-border px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-foreground">Enterprise</h2>
            <p className="mt-1 text-[14px] text-muted-foreground">Custom limits and contract billing.</p>
          </div>
          <a
            href="mailto:team@dubbl.dev?subject=dubbl%20Enterprise"
            className="group inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Talk to us
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </Section>

      {/* What you get */}
      <Section className="py-20 lg:py-28">
        <div className="grid gap-x-6 gap-y-14 lg:grid-cols-12">
          {cells.map((c) => (
            <BentoCell key={c.title} c={c} />
          ))}
        </div>
      </Section>

      {/* Compare */}
      <Section className="py-20 lg:py-28">
        <Eyebrow index="01">Compare</Eyebrow>
        <Heading className="mt-5">Side by side.</Heading>

        <div className="-mx-5 mt-8 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-foreground/80">
                <th className="py-3 pr-4">
                  <span className="sr-only">Feature</span>
                </th>
                {PLAN_ORDER.map((p) => {
                  const price = interval === "annual" ? PLAN_PRICES[p].annual : PLAN_PRICES[p].monthly;
                  return (
                    <th key={p} className="w-[17%] py-3 text-[13px] font-semibold text-foreground">
                      {PLAN_INFO[p].name}
                      <span className="ml-1.5 font-mono text-[11px] font-normal text-muted-foreground">${price}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border">
                  <td className="py-3 pr-4 text-[14px] text-foreground">{row.label}</td>
                  {PLAN_ORDER.map((p) => (
                    <td key={p} className="py-3">
                      <Value value={row.value(PLAN_LIMITS[p], p)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Self-host */}
      <Section className="px-0 sm:px-0 lg:px-0">
        <div className="grid lg:grid-cols-2">
          <div className="px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
            <Eyebrow index="02">Self-host</Eyebrow>
            <Heading lead="Your servers." className="mt-5 max-w-[14ch]">
              Every feature, no limits.
            </Heading>
          </div>
          <div className="flex flex-col justify-center gap-6 border-t border-border px-5 py-16 sm:px-8 lg:border-l lg:border-t-0 lg:px-12 lg:py-20">
            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/docs/self-hosting"
                className="group inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
              >
                Self-host guide
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="https://github.com/dubbl-org/dubbl"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex h-11 items-center gap-1.5 rounded-full border border-border px-5 text-sm text-foreground transition-colors hover:bg-accent"
              >
                GitHub
                <ArrowUpRight className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
              </a>
            </div>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section className="py-20 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <Eyebrow index="03">FAQ</Eyebrow>
            <Heading className="mt-5">Questions.</Heading>
          </div>

          <Accordion type="single" collapsible className="border-t border-border">
            {faqs.map((faq, i) => (
              <AccordionItem key={faq.q} value={`faq-${i}`} className="border-border last:border-b">
                <AccordionTrigger className="gap-6 py-5 text-[15px] font-medium tracking-[-0.01em] text-foreground hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="max-w-[60ch] pb-6 text-[15px] leading-relaxed text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>
    </>
  );
}

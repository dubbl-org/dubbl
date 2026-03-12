import { Check, Minus, Zap, Building2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PLAN_LIMITS, PLAN_PRICES } from "@/lib/plans";

function fmt(v: number): string {
  if (v === Infinity) return "Unlimited";
  if (v >= 1024) return `${v / 1024}GB`;
  return v.toLocaleString();
}

function fmtStorage(mb: number): string {
  if (mb === Infinity) return "Unlimited";
  if (mb >= 1024) return `${mb / 1024}GB`;
  return `${mb}MB`;
}

function fmtAudit(days: number): string {
  if (days === Infinity) return "Unlimited";
  if (days >= 365) return `${Math.floor(days / 365)} year`;
  return `${days} days`;
}

const plans = [
  {
    key: "free" as const,
    name: "Free",
    icon: Sparkles,
    description: "Perfect for freelancers and personal bookkeeping.",
    cta: "Get Started",
    ctaHref: "/sign-up",
    highlighted: false,
  },
  {
    key: "pro" as const,
    name: "Pro",
    icon: Zap,
    description: "For growing teams that need collaboration and advanced reports.",
    cta: "Start Free Trial",
    ctaHref: "/sign-up?plan=pro",
    highlighted: true,
  },
  {
    key: "business" as const,
    name: "Business",
    icon: Building2,
    description: "For organizations with enterprise-grade requirements.",
    cta: "Contact Sales",
    ctaHref: "/contact",
    highlighted: false,
  },
];

const comparisonCategories = [
  {
    name: "Usage",
    rows: [
      { label: "Organizations", values: (l: typeof PLAN_LIMITS) => [fmt(l.free.organizations), fmt(l.pro.organizations), fmt(l.business.organizations)] },
      { label: "Team members", values: (l: typeof PLAN_LIMITS) => [fmt(l.free.members), fmt(l.pro.members), fmt(l.business.members)] },
      { label: "Journal entries / month", values: (l: typeof PLAN_LIMITS) => [fmt(l.free.entriesPerMonth), fmt(l.pro.entriesPerMonth), fmt(l.business.entriesPerMonth)] },
      { label: "Currencies", values: (l: typeof PLAN_LIMITS) => [fmt(l.free.currencies), fmt(l.pro.currencies), fmt(l.business.currencies)] },
      { label: "Contacts", values: (l: typeof PLAN_LIMITS) => [fmt(l.free.contacts), fmt(l.pro.contacts), fmt(l.business.contacts)] },
      { label: "Invoices / month", values: (l: typeof PLAN_LIMITS) => [fmt(l.free.invoicesPerMonth), fmt(l.pro.invoicesPerMonth), fmt(l.business.invoicesPerMonth)] },
      { label: "Bank accounts", values: (l: typeof PLAN_LIMITS) => [fmt(l.free.bankAccounts), fmt(l.pro.bankAccounts), fmt(l.business.bankAccounts)] },
      { label: "Projects", values: (l: typeof PLAN_LIMITS) => [fmt(l.free.projects), fmt(l.pro.projects), fmt(l.business.projects)] },
    ],
  },
  {
    name: "Features",
    rows: [
      { label: "Double-entry bookkeeping", values: () => [true, true, true] },
      { label: "Trial balance & general ledger", values: () => [true, true, true] },
      { label: "Balance sheet & income statement", values: () => [false, true, true] },
      { label: "Cash flow & aged reports", values: () => [false, true, true] },
      { label: "Budget vs actual", values: () => [false, false, true] },
      { label: "Custom reports", values: () => [false, false, true] },
      { label: "API access", values: (l: typeof PLAN_LIMITS) => [l.free.apiAccess, l.pro.apiAccess, l.business.apiAccess] },
      { label: "Storage", values: (l: typeof PLAN_LIMITS) => [fmtStorage(l.free.storageMb), fmtStorage(l.pro.storageMb), fmtStorage(l.business.storageMb)] },
      { label: "Audit log retention", values: (l: typeof PLAN_LIMITS) => [fmtAudit(l.free.auditLogDays), fmtAudit(l.pro.auditLogDays), fmtAudit(l.business.auditLogDays)] },
    ],
  },
  {
    name: "Support",
    rows: [
      { label: "Community support", values: () => [true, true, true] },
      { label: "Email support", values: () => [false, true, true] },
      { label: "Priority support", values: () => [false, false, true] },
      { label: "Dedicated account manager", values: () => [false, false, true] },
    ],
  },
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
            Start free, scale as you grow. All plans include double-entry
            bookkeeping, real-time reports, and self-hosting support.
          </p>
        </div>

        {/* Plan Cards */}
        <div className="mx-auto mt-16 grid max-w-5xl gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const limits = PLAN_LIMITS[plan.key];
            const price = PLAN_PRICES[plan.key];
            const Icon = plan.icon;

            const highlights = [
              `${fmt(limits.organizations)} org${limits.organizations === 1 ? "" : "s"}`,
              `${fmt(limits.members)} member${limits.members <= 2 ? "s" : "s"}`,
              limits.entriesPerMonth === Infinity ? "Unlimited entries" : `${fmt(limits.entriesPerMonth)} entries/mo`,
              `${fmt(limits.currencies)} currenc${limits.currencies === 1 ? "y" : "ies"}`,
              limits.reports.length <= 2 ? "Basic reports" : limits.reports.includes("custom") ? "All + custom reports" : "All standard reports",
              limits.apiAccess ? "API access" : null,
              fmtStorage(limits.storageMb) + " storage",
              `${fmtAudit(limits.auditLogDays)} audit log`,
            ].filter(Boolean) as string[];

            return (
              <div
                key={plan.key}
                className={cn(
                  "relative flex flex-col rounded-2xl border bg-card p-8",
                  plan.highlighted
                    ? "border-emerald-500/50 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/20"
                    : "border-border shadow-sm"
                )}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-emerald-600 px-4 py-1 text-xs font-semibold text-white shadow-sm">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex size-10 items-center justify-center rounded-lg",
                    plan.highlighted
                      ? "bg-emerald-100 dark:bg-emerald-950"
                      : "bg-muted"
                  )}>
                    <Icon className={cn(
                      "size-5",
                      plan.highlighted
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    )} />
                  </div>
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                </div>

                <p className="mt-3 text-sm text-muted-foreground">
                  {plan.description}
                </p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-bold tracking-tight">
                    ${price}
                  </span>
                  {price > 0 && (
                    <span className="text-sm text-muted-foreground">/seat/mo</span>
                  )}
                  {price === 0 && (
                    <span className="ml-2 text-sm text-muted-foreground">forever</span>
                  )}
                </div>

                <div className="mt-8 flex-1">
                  <ul className="space-y-3">
                    {highlights.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8">
                  <Button
                    className={cn(
                      "w-full h-11",
                      plan.highlighted
                        ? "bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                        : ""
                    )}
                    variant={plan.highlighted ? "default" : "outline"}
                    asChild
                  >
                    <a href={plan.ctaHref}>{plan.cta}</a>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Self-hosting callout */}
        <div className="mx-auto mt-12 max-w-5xl">
          <div className="rounded-xl border border-dashed border-emerald-500/30 bg-emerald-50/50 px-6 py-5 text-center dark:bg-emerald-950/20">
            <p className="text-sm text-muted-foreground">
              Self-hosting?{" "}
              <span className="font-medium text-foreground">
                All features are unlocked for free when you self-host.
              </span>{" "}
              No license keys, no telemetry, no limits.
            </p>
          </div>
        </div>

        {/* Feature Comparison Table */}
        <div className="mx-auto mt-24 max-w-5xl">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Compare plans in detail
            </h2>
            <p className="mt-3 text-muted-foreground">
              Everything you need to know about what each plan includes.
            </p>
          </div>

          <div className="mt-12 overflow-x-auto">
            <table className="w-full">
              {/* Sticky header */}
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-4 pr-4 text-left text-sm font-medium text-muted-foreground w-[40%]" />
                  {plans.map((plan) => (
                    <th
                      key={plan.key}
                      className={cn(
                        "pb-4 text-center text-sm font-semibold w-[20%]",
                        plan.highlighted ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                      )}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonCategories.map((category) => (
                  <>
                    <tr key={category.name}>
                      <td
                        colSpan={4}
                        className="pb-2 pt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {category.name}
                      </td>
                    </tr>
                    {category.rows.map((row) => {
                      const values = row.values(PLAN_LIMITS);
                      return (
                        <tr key={row.label} className="border-b border-border/50">
                          <td className="py-3 pr-4 text-sm text-foreground">
                            {row.label}
                          </td>
                          {values.map((value, i) => (
                            <td key={i} className="py-3 text-center">
                              <ComparisonValue value={value} />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ mini-section */}
        <div className="mx-auto mt-24 max-w-3xl">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Frequently asked questions
          </h2>
          <div className="mt-10 space-y-6">
            {[
              {
                q: "Can I switch plans later?",
                a: "Yes. You can upgrade or downgrade at any time. When upgrading, you'll be prorated for the remainder of your billing period. When downgrading, the change takes effect at the end of your current period.",
              },
              {
                q: "What happens if I exceed my plan limits?",
                a: "We won't cut you off. You'll receive a notification and have a grace period to either upgrade or reduce usage. We believe in being fair and transparent.",
              },
              {
                q: "Do you offer annual billing?",
                a: "Yes. Annual billing gives you 2 months free (pay for 10, get 12). Contact us or switch to annual in your billing settings.",
              },
              {
                q: "Is self-hosting really free?",
                a: "Yes. dubbl is open source under Apache 2.0. Self-hosted instances have no feature limitations, no user caps, and no telemetry. The cloud plans fund development of the open source project.",
              },
            ].map((faq) => (
              <div key={faq.q} className="rounded-lg border border-border bg-card px-6 py-5">
                <h3 className="font-semibold text-foreground">{faq.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mx-auto mt-24 max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Ready to get started?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Join thousands of teams using dubbl for their accounting needs.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700"
              asChild
            >
              <a href="/sign-up">Start for Free</a>
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

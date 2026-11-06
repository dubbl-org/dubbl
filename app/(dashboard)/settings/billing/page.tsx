"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/query/use-api";
import {
  PAID_PLANS,
  PLAN_INFO,
  PLAN_ORDER,
  PLAN_PRICES,
  annualSaving,
  type PaidPlanName,
  type PlanName,
} from "@/lib/plans";
import type { BillingSummary } from "@/lib/api/billing-summary";

type Interval = "monthly" | "annual";

const maxSaving = Math.max(...PAID_PLANS.map(annualSaving));

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function orgHeaders(): Record<string, string> {
  const orgId = localStorage.getItem("activeOrgId");
  return orgId ? { "x-organization-id": orgId } : {};
}

export default function BillingPage() {
  return (
    <Suspense fallback={<BrandLoader />}>
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, loading, refetch } = useApi<{ billing?: BillingSummary }>("/api/v1/billing");
  const billing = data?.billing ?? null;
  const [pending, setPending] = useState<string | null>(null);
  const [intervalDraft, setInterval] = useState<Interval | null>(null);
  // The interval in the URL wins; otherwise a paid plan's own interval, else annual
  const urlInterval = searchParams.get("interval");
  const interval: Interval =
    intervalDraft ??
    (urlInterval
      ? urlInterval === "monthly" ? "monthly" : "annual"
      : billing && billing.plan !== "free" ? billing.billingInterval : "annual");

  // A plan chosen on the pricing page, waiting for confirmation
  const requested = useMemo(() => {
    const p = searchParams.get("upgrade");
    return p && (PAID_PLANS as readonly string[]).includes(p) ? (p as PaidPlanName) : null;
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast.success("Thanks! Your plan is active.");
      router.replace("/settings/billing");
    }
  }, [searchParams, router]);

  async function checkout(plan: string) {
    if (pending) return;
    setPending(plan);
    try {
      const res = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...orgHeaders() },
        body: JSON.stringify({ plan, interval }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.updated) {
        toast.success("Plan updated");
        router.replace("/settings/billing");
        await refetch();
      } else {
        throw new Error(typeof data.error === "string" ? data.error : "Couldn't start checkout");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start checkout");
    }
    setPending(null);
  }

  async function openPortal() {
    if (pending) return;
    setPending("portal");
    try {
      const res = await fetch("/api/v1/billing/portal", { method: "POST", headers: orgHeaders() });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error(data.error || "Couldn't open billing portal");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open billing portal");
    }
    setPending(null);
  }

  if (loading) return <BrandLoader />;

  if (!billing || billing.selfHosted) {
    return (
      <ContentReveal>
        <div className="rounded-xl border bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-muted">
            <Check className="size-5" />
          </div>
          <h3 className="text-base font-semibold">Every feature unlocked</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            This is a self-hosted instance: every feature is included with no limits, and no subscription is needed.
          </p>
        </div>
      </ContentReveal>
    );
  }

  const current = billing.plan;
  const currentRank = PLAN_ORDER.indexOf(current);
  const manual = billing.managedBy === "manual";
  const pastDue = billing.status === "past_due" || billing.status === "incomplete";

  return (
    <ContentReveal className="space-y-10">
      {pastDue && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Payment failed</p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
              Update your payment method to keep your plan. Adding members is paused until then.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openPortal} disabled={pending !== null}>
            Update payment
          </Button>
        </div>
      )}

      {requested && requested !== current && !manual && (
        <div className="flex flex-col gap-3 rounded-xl border bg-foreground/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Confirm {PLAN_INFO[requested].name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              ${PLAN_PRICES[requested][interval]} a month
              {interval === "annual" ? `, billed yearly at $${PLAN_PRICES[requested].annual * 12}` : ", billed monthly"}.
              Unlimited users included.
            </p>
          </div>
          <Button size="sm" onClick={() => checkout(requested)} disabled={pending !== null} loading={pending === requested}>
            Continue to checkout
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      )}

      {/* Current plan */}
      <section className="rounded-xl border p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Current plan</p>
            <div className="mt-1 flex items-center gap-2">
              <h3 className="text-xl font-semibold tracking-tight">{billing.planName}</h3>
              {billing.status !== "active" && (
                <Badge variant="outline" className="capitalize">{billing.status.replace("_", " ")}</Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {current === "free"
                ? "Free forever for one user."
                : manual
                  ? "Managed by the dubbl team."
                  : `$${PLAN_PRICES[current][billing.billingInterval]} a month, billed ${billing.billingInterval === "annual" ? "yearly" : "monthly"}`}
              {billing.currentPeriodEnd && !manual && current !== "free" && (
                <> · {billing.cancelAtPeriodEnd ? "ends" : "renews"} {new Date(billing.currentPeriodEnd).toLocaleDateString()}</>
              )}
            </p>
          </div>
          {billing.hasStripeSubscription && !manual && (
            <Button variant="outline" size="sm" onClick={openPortal} disabled={pending !== null} loading={pending === "portal"}>
              Invoices & payment
            </Button>
          )}
        </div>

        <div className="mt-5 grid gap-x-8 gap-y-4 border-t pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <Meter label="Users" used={billing.usage.members.used} max={billing.usage.members.max} />
          <Meter label="Payroll employees" used={billing.usage.employees.used} max={billing.usage.employees.max} />
          <Meter label="Bank accounts" used={billing.usage.bankAccounts.used} max={billing.usage.bankAccounts.max} />
          <Meter label="Projects" used={billing.usage.projects.used} max={billing.usage.projects.max} />
          <Meter
            label="Storage"
            used={billing.usage.storageBytes.used}
            max={billing.usage.storageBytes.max}
            format={formatBytes}
          />
          <Meter label="Emails this month" used={billing.usage.emailsThisMonth.used} max={billing.usage.emailsThisMonth.max} />
        </div>
      </section>

      {/* Plans */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Plans</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              One price for the whole organization. Every paid plan includes unlimited users.
            </p>
          </div>
          <IntervalToggle value={interval} onChange={setInterval} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PLAN_ORDER.map((plan) => (
            <PlanCard
              key={plan}
              plan={plan}
              interval={interval}
              current={plan === current}
              highlighted={plan === requested && plan !== current}
              action={
                manual
                  ? null
                  : plan === current
                    ? null
                    : plan === "free"
                      ? { label: "Downgrade", onClick: openPortal, variant: "outline" }
                      : {
                          label: PLAN_ORDER.indexOf(plan) > currentRank ? "Upgrade" : "Switch",
                          onClick: () => checkout(plan),
                          variant: PLAN_ORDER.indexOf(plan) > currentRank ? "default" : "outline",
                        }
              }
              loading={pending === plan || (plan === "free" && pending === "portal")}
              disabled={pending !== null || (plan === "free" && !billing.hasStripeSubscription)}
            />
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-3 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Enterprise</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Custom limits, consolidation across every entity, contract billing and a named contact.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href="mailto:team@dubbl.dev?subject=dubbl%20Enterprise">Talk to us</a>
          </Button>
        </div>

        {manual && (
          <p className="mt-3 text-xs text-muted-foreground">
            Your plan is managed by the dubbl team. Email{" "}
            <a href="mailto:team@dubbl.dev" className="underline underline-offset-2">team@dubbl.dev</a> to change it.
          </p>
        )}
      </section>

    </ContentReveal>
  );
}

function Meter({
  label,
  used,
  max,
  format = (n: number) => n.toLocaleString("en-US"),
}: {
  label: string;
  used: number;
  max: number | null;
  format?: (n: number) => string;
}) {
  const pct = max ? Math.min((used / max) * 100, 100) : 0;
  const full = max !== null && used >= max;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium">{label}</span>
        <span className={cn("font-mono tabular-nums", full ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
          {format(used)}
          {max === null ? <span className="font-sans"> · Unlimited</span> : ` / ${format(max)}`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        {max !== null && (
          <div
            className={cn("h-full rounded-full transition-all", full ? "bg-amber-500" : pct > 80 ? "bg-foreground/70" : "bg-foreground/40")}
            style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%` }}
          />
        )}
      </div>
    </div>
  );
}

function IntervalToggle({ value, onChange }: { value: Interval; onChange: (v: Interval) => void }) {
  return (
    <div role="radiogroup" aria-label="Billing interval" className="flex w-fit items-center gap-1 rounded-lg border p-1">
      {(["monthly", "annual"] as const).map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
            value === v ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {v}
          {v === "annual" && <span className="ml-1.5 text-[10px] text-muted-foreground">−{maxSaving}%</span>}
        </button>
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  interval,
  current,
  highlighted,
  action,
  loading,
  disabled,
}: {
  plan: PlanName;
  interval: Interval;
  current: boolean;
  highlighted: boolean;
  action: { label: string; onClick: () => void; variant: "default" | "outline" } | null;
  loading: boolean;
  disabled: boolean;
}) {
  const info = PLAN_INFO[plan];
  const price = PLAN_PRICES[plan][interval];
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border p-5",
        current && "bg-foreground/[0.04]",
        highlighted && "border-foreground/40"
      )}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{info.name}</h4>
        {current && <Badge variant="secondary">Current</Badge>}
      </div>
      <p className="mt-1 min-h-[2.5em] text-xs text-muted-foreground">{info.tagline}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
        ${price}
        <span className="ml-1 text-xs font-normal text-muted-foreground">{plan === "free" ? "forever" : "/ month"}</span>
      </p>
      <p className="mt-1 h-4 text-[11px] text-muted-foreground">
        {plan !== "free" && (interval === "annual" ? `$${price * 12} billed yearly` : "Billed monthly")}
      </p>
      <ul className="mt-4 flex-1 space-y-2">
        {info.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2 text-[12.5px] leading-snug">
            <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            {h}
          </li>
        ))}
      </ul>
      <div className="mt-5">
        {action ? (
          <Button size="sm" variant={action.variant} className="w-full" onClick={action.onClick} disabled={disabled} loading={loading}>
            {action.label}
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="w-full" disabled>
            {current ? "Current plan" : info.name}
          </Button>
        )}
      </div>
    </div>
  );
}

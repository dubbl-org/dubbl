"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Check, CreditCard, Sparkles, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContentReveal } from "@/components/ui/content-reveal";
import { cn } from "@/lib/utils";

interface BillingInfo {
  plan: "free" | "pro" | "business";
  status: string;
  seatCount: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "",
    description: "For individuals getting started",
    icon: CreditCard,
    features: [
      "1 organization",
      "2 members",
      "500 entries/month",
      "1 currency",
      "Trial balance report",
      "100MB storage",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$12",
    period: "/seat/mo",
    description: "For growing teams and businesses",
    icon: Sparkles,
    features: [
      "3 organizations",
      "10 members",
      "Unlimited entries",
      "5 currencies",
      "All reports",
      "5GB storage",
      "API access",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: "$29",
    period: "/seat/mo",
    description: "For large teams with advanced needs",
    icon: Building2,
    features: [
      "Unlimited organizations",
      "Unlimited members",
      "Unlimited entries",
      "Unlimited currencies",
      "All + custom reports",
      "50GB storage",
      "API access",
      "Unlimited audit log",
    ],
  },
];

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [, setLoading] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/billing", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.billing) setBilling(data.billing);
      })
      .finally(() => setLoading(false));
  }, []);

  async function checkout(plan: string) {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || checkoutPlan) return;
    setCheckoutPlan(plan);

    try {
      const res = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else throw new Error(data.error);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start checkout");
      setCheckoutPlan(null);
    }
  }

  async function openPortal() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || portalLoading) return;
    setPortalLoading(true);

    try {
      const res = await fetch("/api/v1/billing/portal", {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      toast.error("Failed to open billing portal");
      setPortalLoading(false);
    }
  }

  const currentPlan = billing?.plan || "free";
  const activePlanData = plans.find((p) => p.id === currentPlan)!;
  const ActiveIcon = activePlanData.icon;

  return (
    <ContentReveal className="space-y-8">
      {/* Current plan card */}
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border p-6",
          "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60">
              <ActiveIcon className="size-5 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold capitalize">
                  {currentPlan} plan
                </h2>
                <Badge className="bg-emerald-100 text-emerald-700 border-0 dark:bg-emerald-900/60 dark:text-emerald-400">
                  Active
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {billing?.seatCount
                  ? `${billing.seatCount} seat${billing.seatCount !== 1 ? "s" : ""}`
                  : "1 seat"}
                {billing?.currentPeriodEnd
                  ? ` · Renews ${new Date(billing.currentPeriodEnd).toLocaleDateString()}`
                  : ""}
                {billing?.cancelAtPeriodEnd ? " · Cancels at period end" : ""}
              </p>
            </div>
          </div>
          {currentPlan !== "free" && (
            <Button
              variant="outline"
              size="sm"
              onClick={openPortal}
              disabled={portalLoading}
              className="shrink-0"
            >
              {portalLoading ? "Loading..." : "Manage Billing"}
            </Button>
          )}
        </div>
      </div>

      {/* Section heading */}
      <div>
        <h3 className="text-sm font-medium">Compare plans</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Choose the right plan for your team.
        </p>
      </div>

      {/* Plan comparison cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const PlanIcon = plan.icon;
          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col rounded-xl border p-6 transition-shadow",
                isCurrent
                  ? "border-emerald-300 ring-1 ring-emerald-300 dark:border-emerald-800 dark:ring-emerald-800"
                  : "hover:shadow-sm"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg",
                      isCurrent
                        ? "bg-emerald-100 dark:bg-emerald-950/60"
                        : "bg-muted"
                    )}
                  >
                    <PlanIcon
                      className={cn(
                        "size-4",
                        isCurrent
                          ? "text-emerald-600"
                          : "text-muted-foreground"
                      )}
                    />
                  </div>
                  <h3 className="text-sm font-semibold">{plan.name}</h3>
                </div>
                {isCurrent && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-0 dark:bg-emerald-900/60 dark:text-emerald-400">
                    Current
                  </Badge>
                )}
              </div>

              <p className="mt-2 text-[12px] text-muted-foreground">
                {plan.description}
              </p>

              <div className="mt-4">
                <span className="text-3xl font-bold tracking-tight">
                  {plan.price}
                </span>
                <span className="text-sm text-muted-foreground">
                  {plan.period}
                </span>
              </div>

              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[13px]">
                    <Check className="size-3.5 shrink-0 text-emerald-600" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {isCurrent ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    size="sm"
                    disabled
                  >
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className={cn(
                      "w-full",
                      plan.id !== "free" &&
                        "bg-emerald-600 hover:bg-emerald-700"
                    )}
                    variant={plan.id === "free" ? "outline" : "default"}
                    onClick={() => checkout(plan.id)}
                    disabled={checkoutPlan !== null}
                  >
                    {checkoutPlan === plan.id
                      ? "Loading..."
                      : plan.id === "free"
                        ? "Downgrade"
                        : "Upgrade"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ContentReveal>
  );
}

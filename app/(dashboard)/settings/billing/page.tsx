"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="space-y-10">
      {/* Current plan overview */}
      <section className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
        <div className="shrink-0">
          <p className="text-sm font-medium">Current plan</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Your organization's subscription and usage.
          </p>
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="flex items-center gap-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                <span className="text-lg font-bold text-emerald-600">
                  {currentPlan === "free" ? "F" : currentPlan === "pro" ? "P" : "B"}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold capitalize">{currentPlan} plan</p>
                <p className="text-[12px] text-muted-foreground">
                  {billing?.seatCount ? `${billing.seatCount} seat${billing.seatCount !== 1 ? "s" : ""}` : "1 seat"}
                  {billing?.currentPeriodEnd
                    ? ` · Renews ${new Date(billing.currentPeriodEnd).toLocaleDateString()}`
                    : ""}
                </p>
              </div>
            </div>
            {currentPlan !== "free" && (
              <Button variant="outline" size="sm" onClick={openPortal} disabled={portalLoading}>
                {portalLoading ? "Loading..." : "Manage Billing"}
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="h-px bg-border" />

      {/* Plans */}
      <section className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
        <div className="shrink-0">
          <p className="text-sm font-medium">Plans</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Compare features and choose the right plan for your team.
          </p>
        </div>
        <div className="min-w-0 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            return (
              <div
                key={plan.id}
                className={cn(
                  "rounded-lg border p-5",
                  isCurrent && "border-emerald-300 ring-1 ring-emerald-300"
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{plan.name}</h3>
                  {isCurrent && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0">
                      Current
                    </Badge>
                  )}
                </div>
                <div className="mt-2">
                  <span className="text-3xl font-bold tracking-tight">
                    {plan.price}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {plan.period}
                  </span>
                </div>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-[13px]">
                      <Check className="size-3.5 text-emerald-600 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" size="sm" disabled>
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
                      {checkoutPlan === plan.id ? "Loading..." : plan.id === "free" ? "Downgrade" : "Upgrade"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

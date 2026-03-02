"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
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
    if (!orgId) return;

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
    }
  }

  async function openPortal() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch("/api/v1/billing/portal", {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      toast.error("Failed to open billing portal");
    }
  }

  const currentPlan = billing?.plan || "free";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Billing" description="Manage your plan and billing.">
        {currentPlan !== "free" && (
          <Button variant="outline" onClick={openPortal}>
            Manage Billing
          </Button>
        )}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <div
              key={plan.id}
              className={cn(
                "rounded-lg border p-6 shadow-sm",
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
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="size-3.5 text-emerald-600 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    className={cn(
                      "w-full",
                      plan.id !== "free" &&
                        "bg-emerald-600 hover:bg-emerald-700"
                    )}
                    variant={plan.id === "free" ? "outline" : "default"}
                    onClick={() => checkout(plan.id)}
                  >
                    {plan.id === "free" ? "Downgrade" : "Upgrade"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

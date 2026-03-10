"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Check, Users, HardDrive, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContentReveal } from "@/components/ui/content-reveal";
import { cn } from "@/lib/utils";

interface BillingInfo {
  plan: "free" | "pro";
  status: string;
  seatCount: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  storagePlan: "free" | "starter" | "growth" | "scale";
}

const SEAT_PRICE = 12;

const storagePlans = [
  {
    id: "free",
    name: "Free",
    storage: "5 GB",
    price: "$0",
    period: "",
    description: "Included with every organization",
  },
  {
    id: "starter",
    name: "Starter",
    storage: "25 GB",
    price: "$5",
    period: "/mo",
    description: "For growing teams with more data",
  },
  {
    id: "growth",
    name: "Growth",
    storage: "100 GB",
    price: "$15",
    period: "/mo",
    description: "For established businesses",
  },
  {
    id: "scale",
    name: "Scale",
    storage: "500 GB",
    price: "$40",
    period: "/mo",
    description: "For large organizations",
  },
];

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
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

  async function checkout(type: "seats" | "storage", plan?: string) {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || checkoutLoading) return;
    setCheckoutLoading(plan || type);

    try {
      const res = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ type, plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else throw new Error(data.error);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start checkout");
      setCheckoutLoading(null);
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
  const seatCount = billing?.seatCount || 1;
  const currentStorage = billing?.storagePlan || "free";
  const isPro = currentPlan === "pro";

  return (
    <ContentReveal className="space-y-10">
      {/* Seat-based pricing */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Team seats</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Your first member is always free. Additional seats are ${SEAT_PRICE}/seat/month.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Free tier */}
          <div
            className={cn(
              "flex flex-col rounded-xl border p-6",
              !isPro && "border-emerald-300 ring-1 ring-emerald-300 dark:border-emerald-800 dark:ring-emerald-800"
            )}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Free</h4>
              {!isPro && (
                <Badge className="bg-emerald-100 text-emerald-700 border-0 dark:bg-emerald-900/60 dark:text-emerald-400">
                  Current
                </Badge>
              )}
            </div>
            <div className="mt-3">
              <span className="text-3xl font-bold tracking-tight">$0</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">For individuals getting started</p>
            <ul className="mt-4 flex-1 space-y-2">
              <li className="flex items-center gap-2 text-[13px]">
                <Check className="size-3.5 shrink-0 text-emerald-600" />
                1 team member included
              </li>
              <li className="flex items-center gap-2 text-[13px]">
                <Check className="size-3.5 shrink-0 text-emerald-600" />
                All core features
              </li>
              <li className="flex items-center gap-2 text-[13px]">
                <Check className="size-3.5 shrink-0 text-emerald-600" />
                Community support
              </li>
            </ul>
            <div className="mt-6">
              <Button variant="outline" size="sm" className="w-full" disabled={!isPro}>
                {!isPro ? "Current Plan" : "Downgrade"}
              </Button>
            </div>
          </div>

          {/* Pro tier */}
          <div
            className={cn(
              "flex flex-col rounded-xl border p-6",
              isPro && "border-emerald-300 ring-1 ring-emerald-300 dark:border-emerald-800 dark:ring-emerald-800"
            )}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Pro</h4>
              {isPro && (
                <Badge className="bg-emerald-100 text-emerald-700 border-0 dark:bg-emerald-900/60 dark:text-emerald-400">
                  Current · {seatCount} seat{seatCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <div className="mt-3">
              <span className="text-3xl font-bold tracking-tight">${SEAT_PRICE}</span>
              <span className="text-sm text-muted-foreground">/seat/mo</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">1st member free, then ${SEAT_PRICE}/additional seat</p>
            <ul className="mt-4 flex-1 space-y-2">
              <li className="flex items-center gap-2 text-[13px]">
                <Check className="size-3.5 shrink-0 text-emerald-600" />
                Unlimited team members
              </li>
              <li className="flex items-center gap-2 text-[13px]">
                <Check className="size-3.5 shrink-0 text-emerald-600" />
                All features + API access
              </li>
              <li className="flex items-center gap-2 text-[13px]">
                <Check className="size-3.5 shrink-0 text-emerald-600" />
                Priority support
              </li>
              <li className="flex items-center gap-2 text-[13px]">
                <Check className="size-3.5 shrink-0 text-emerald-600" />
                Audit log
              </li>
            </ul>
            <div className="mt-6">
              {isPro ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={openPortal}
                  disabled={portalLoading}
                >
                  {portalLoading ? "Loading..." : "Manage Billing"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => checkout("seats", "pro")}
                  disabled={checkoutLoading !== null}
                >
                  {checkoutLoading === "pro" ? "Loading..." : "Upgrade to Pro"}
                </Button>
              )}
            </div>
          </div>
        </div>

        {isPro && billing?.currentPeriodEnd && (
          <p className="mt-3 text-xs text-muted-foreground">
            {billing.cancelAtPeriodEnd ? "Cancels" : "Renews"} on{" "}
            {new Date(billing.currentPeriodEnd).toLocaleDateString()}
          </p>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* Storage plans */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <HardDrive className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Organization storage</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Storage covers all your organization data: transactions, documents, attachments, and more. 5 GB is included free.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {storagePlans.map((plan) => {
            const isCurrent = plan.id === currentStorage;
            return (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col rounded-xl border p-5 transition-shadow",
                  isCurrent
                    ? "border-emerald-300 ring-1 ring-emerald-300 dark:border-emerald-800 dark:ring-emerald-800"
                    : "hover:shadow-sm"
                )}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">{plan.name}</h4>
                  {isCurrent && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] dark:bg-emerald-900/60 dark:text-emerald-400">
                      Current
                    </Badge>
                  )}
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold tracking-tight">{plan.storage}</span>
                </div>
                <div className="mt-1">
                  <span className="text-lg font-semibold">{plan.price}</span>
                  <span className="text-xs text-muted-foreground">{plan.period}</span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground flex-1">{plan.description}</p>
                <div className="mt-4">
                  {isCurrent ? (
                    <Button variant="outline" size="sm" className="w-full text-xs" disabled>
                      Current
                    </Button>
                  ) : (
                    <Button
                      variant={plan.id === "free" ? "outline" : "default"}
                      size="sm"
                      className={cn(
                        "w-full text-xs",
                        plan.id !== "free" && "bg-emerald-600 hover:bg-emerald-700"
                      )}
                      onClick={() => checkout("storage", plan.id)}
                      disabled={checkoutLoading !== null}
                    >
                      {checkoutLoading === plan.id ? "Loading..." : plan.id === "free" ? "Downgrade" : "Upgrade"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Transparency note + contact */}
      <div className="rounded-xl border bg-muted/30 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-lg">
            <h3 className="text-sm font-semibold">Open source, transparent pricing</h3>
            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
              dubbl is open source. Our pricing is designed to be fair and sustainable. The free tier gives you everything you need to get started. Storage plans are organization-wide and cover all data, not just file uploads. Need more storage or have special requirements? We are happy to help.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => window.location.href = "mailto:support@dubbl.dev"}
          >
            <Mail className="size-3.5" />
            Contact us
          </Button>
        </div>
      </div>
    </ContentReveal>
  );
}

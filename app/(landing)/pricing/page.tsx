import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Perfect for personal use and getting started.",
    features: [
      "1 organization",
      "2 members",
      "500 entries/month",
      "1 currency",
      "Trial balance report",
      "100MB storage",
      "30-day audit log",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$12",
    period: "/seat/mo",
    description: "For growing teams that need more power.",
    features: [
      "3 organizations",
      "10 members",
      "Unlimited entries",
      "5 currencies",
      "All reports",
      "5GB storage",
      "API access",
      "1-year audit log",
    ],
    cta: "Start Pro Trial",
    highlighted: true,
  },
  {
    name: "Business",
    price: "$29",
    period: "/seat/mo",
    description: "For enterprises with advanced needs.",
    features: [
      "Unlimited organizations",
      "Unlimited members",
      "Unlimited entries",
      "Unlimited currencies",
      "All + custom reports",
      "50GB storage",
      "API access",
      "Unlimited audit log",
      "Priority support",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="pt-32 pb-20">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free, scale as you grow. All plans include double-entry
            bookkeeping, real-time reports, and self-hosting.
          </p>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative rounded-xl border bg-card p-8 shadow-sm",
                plan.highlighted &&
                  "border-emerald-300 ring-1 ring-emerald-300"
              )}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white">
                    Most Popular
                  </span>
                </div>
              )}
              <div>
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </div>
              <div className="mt-6">
                <span className="text-4xl font-bold tracking-tight">
                  {plan.price}
                </span>
                <span className="text-sm text-muted-foreground">
                  {plan.period}
                </span>
              </div>
              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="size-4 text-emerald-600 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Button
                  className={cn(
                    "w-full",
                    plan.highlighted
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : ""
                  )}
                  variant={plan.highlighted ? "default" : "outline"}
                  asChild
                >
                  <a href="/sign-up">{plan.cta}</a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
}

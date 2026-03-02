"use client";

import {
  CreditCard,
  FileText,
  ArrowLeftRight,
  Building2,
  Wallet,
  ShoppingBag,
  Send,
  Store,
  Receipt,
  Waves,
  Landmark,
  Code2,
} from "lucide-react";
import { Container } from "@/components/shared/container";
import { SectionHeader } from "@/components/shared/section-header";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import type { LucideIcon } from "lucide-react";

interface Integration {
  name: string;
  description: string;
  icon: LucideIcon;
}

const integrations: Integration[] = [
  { name: "Stripe", description: "Payments", icon: CreditCard },
  { name: "QuickBooks", description: "Accounting", icon: FileText },
  { name: "Xero", description: "Accounting", icon: ArrowLeftRight },
  { name: "Plaid", description: "Banking", icon: Building2 },
  { name: "PayPal", description: "Payments", icon: Wallet },
  { name: "Shopify", description: "E-commerce", icon: ShoppingBag },
  { name: "Wise", description: "Transfers", icon: Send },
  { name: "Square", description: "POS", icon: Store },
  { name: "FreshBooks", description: "Invoicing", icon: Receipt },
  { name: "Wave", description: "Accounting", icon: Waves },
  { name: "Banks", description: "12,000+", icon: Landmark },
  { name: "REST API", description: "Custom", icon: Code2 },
];

export function Integrations() {
  return (
    <section className="py-16 md:py-20">
      <Container>
        <SectionHeader
          badge="Integrations"
          title="Connect to your stack"
          subtitle="Seamlessly sync with the platforms and services you already use."
        />

        <ScrollReveal>
          <div className="relative overflow-hidden rounded-2xl border border-border bg-muted/30">
            {/* Blueprint hash overlay */}
            <div className="blueprint-hash pointer-events-none absolute inset-0" />

            <div className="relative grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
              {integrations.map((item) => (
                <div
                  key={item.name}
                  className="group flex flex-col items-center gap-2.5 border-b border-r border-border/50 px-4 py-8 text-center transition-colors last:border-r-0 hover:bg-background/60 md:[&:nth-child(6n)]:border-r-0 sm:[&:nth-child(4n)]:border-r-0 max-sm:[&:nth-child(3n)]:border-r-0"
                >
                  <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-background shadow-sm transition-all group-hover:border-emerald-300 group-hover:shadow-md dark:group-hover:border-emerald-700">
                    <item.icon className="size-5 text-muted-foreground transition-colors group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {item.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}

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
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface Integration {
  name: string;
  category: string;
  icon: LucideIcon;
  color: string; // icon hover color class
}

const row1: Integration[] = [
  { name: "Stripe", category: "Payments", icon: CreditCard, color: "text-blue-500" },
  { name: "Plaid", category: "Banking", icon: Building2, color: "text-emerald-500" },
  { name: "Shopify", category: "E-commerce", icon: ShoppingBag, color: "text-purple-500" },
  { name: "QuickBooks", category: "Accounting", icon: FileText, color: "text-amber-500" },
  { name: "Wise", category: "Transfers", icon: Send, color: "text-blue-500" },
  { name: "Square", category: "POS", icon: Store, color: "text-emerald-500" },
];

const row2: Integration[] = [
  { name: "PayPal", category: "Payments", icon: Wallet, color: "text-blue-500" },
  { name: "Xero", category: "Accounting", icon: ArrowLeftRight, color: "text-amber-500" },
  { name: "FreshBooks", category: "Invoicing", icon: Receipt, color: "text-emerald-500" },
  { name: "Wave", category: "Accounting", icon: Waves, color: "text-amber-500" },
  { name: "Banks", category: "12,000+ via Plaid", icon: Landmark, color: "text-emerald-500" },
  { name: "REST API", category: "Custom", icon: Code2, color: "text-purple-500" },
];

/* ------------------------------------------------------------------ */
/*  Marquee Row                                                        */
/* ------------------------------------------------------------------ */

function MarqueeRow({
  items,
  reverse,
  duration,
}: {
  items: Integration[];
  reverse?: boolean;
  duration: number;
}) {
  // Duplicate for seamless loop
  const doubled = [...items, ...items];

  return (
    <div className="group relative overflow-hidden">
      <div
        className="flex shrink-0 gap-4 [&:hover]:animation-play-state-paused"
        style={{
          animation: `marquee-int-${reverse ? "reverse" : "forward"} ${duration}s linear infinite`,
        }}
      >
        {doubled.map((item, i) => (
          <div
            key={`${item.name}-${i}`}
            className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-emerald-300/50 dark:hover:border-emerald-700/50"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <item.icon
                className={cn(
                  "size-5 text-muted-foreground transition-colors group-hover:text-muted-foreground",
                )}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{item.name}</p>
              <p className="text-[11px] text-muted-foreground">{item.category}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Exported Component                                                 */
/* ------------------------------------------------------------------ */

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
          <div className="overflow-hidden rounded-2xl border border-border bg-muted/30 p-5 md:p-6">
            <div
              className="relative overflow-hidden rounded-xl"
              style={{
                maskImage:
                  "linear-gradient(to right, transparent, black 48px, black calc(100% - 48px), transparent)",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent, black 48px, black calc(100% - 48px), transparent)",
              }}
            >
              <div className="space-y-4">
                <MarqueeRow items={row1} duration={40} />
                <MarqueeRow items={row2} reverse duration={45} />
              </div>
            </div>
          </div>
        </ScrollReveal>

        <style>{`
          @keyframes marquee-int-forward {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
          @keyframes marquee-int-reverse {
            from { transform: translateX(-50%); }
            to { transform: translateX(0); }
          }
        `}</style>
      </Container>
    </section>
  );
}

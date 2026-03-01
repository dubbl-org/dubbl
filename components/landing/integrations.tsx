"use client";

import { motion } from "motion/react";
import {
  CreditCard,
  FileText,
  ArrowLeftRight,
  Wallet,
  ShoppingBag,
  Building2,
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

const integrations = [
  { name: "Stripe", icon: CreditCard },
  { name: "QuickBooks", icon: FileText },
  { name: "Xero", icon: ArrowLeftRight },
  { name: "Plaid", icon: Building2 },
  { name: "PayPal", icon: Wallet },
  { name: "Shopify", icon: ShoppingBag },
  { name: "Wise", icon: Send },
  { name: "Square", icon: Store },
  { name: "FreshBooks", icon: Receipt },
  { name: "Wave", icon: Waves },
  { name: "Banks", icon: Landmark },
  { name: "REST API", icon: Code2 },
];

export function Integrations() {
  return (
    <section className="py-20 md:py-28">
      <Container>
        <SectionHeader
          badge="Integrations"
          title="Connect to your existing tools"
          subtitle="Seamlessly sync with the platforms and services you already use."
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {integrations.map((item, i) => (
            <ScrollReveal key={i} delay={i * 0.04}>
              <motion.div
                whileHover={{ scale: 1.04, y: -2 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center gap-3 rounded-xl border bg-card p-6 transition-shadow hover:shadow-md"
              >
                <div className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <item.icon className="size-6" />
                </div>
                <span className="text-sm font-medium">{item.name}</span>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

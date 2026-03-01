"use client";

import { motion } from "motion/react";
import {
  Globe,
  Code2,
  BarChart3,
  Shield,
  Plug,
  BookOpen,
} from "lucide-react";
import { Container } from "@/components/shared/container";
import { SectionHeader } from "@/components/shared/section-header";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { GridBackground } from "@/components/shared/grid-background";

const features = [
  {
    title: "Double-Entry Bookkeeping",
    description:
      "Every transaction balances. Debits always equal credits — enforced at the database level.",
    icon: BookOpen,
    span: 2,
    visual: (
      <div className="mt-4 space-y-2 font-mono text-xs">
        <div className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2">
          <span className="text-emerald-700">Cash</span>
          <span className="font-bold text-emerald-600">DR $5,000</span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-red-50 px-3 py-2">
          <span className="text-red-700">Revenue</span>
          <span className="font-bold text-red-600">CR $5,000</span>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-emerald-600">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Balanced
        </div>
      </div>
    ),
  },
  {
    title: "Multi-Currency",
    description:
      "Transact in any currency with automatic rate conversion and gain/loss tracking.",
    icon: Globe,
    span: 1,
    visual: (
      <div className="mt-4 space-y-1 text-xs">
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5">
          <span>USD</span>
          <span className="font-mono font-bold">$1,000.00</span>
        </div>
        <div className="flex items-center justify-center text-muted-foreground">
          <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5">
          <span>EUR</span>
          <span className="font-mono font-bold">&euro;921.45</span>
        </div>
      </div>
    ),
  },
  {
    title: "API-First",
    description:
      "Every feature accessible via REST API. Build custom integrations in minutes.",
    icon: Code2,
    span: 1,
    visual: (
      <div className="mt-4 rounded-md bg-zinc-900 p-3 font-mono text-[10px] leading-relaxed text-emerald-400">
        <span className="text-blue-400">POST</span> /api/v1/entries
        <br />
        <span className="text-zinc-500">{"{ "}</span>
        <span className="text-amber-300">&quot;amount&quot;</span>: 5000
        <span className="text-zinc-500">{" }"}</span>
      </div>
    ),
  },
  {
    title: "Real-Time Reports",
    description:
      "Balance sheets, P&L, and cash flow statements generated instantly.",
    icon: BarChart3,
    span: 1,
    visual: (
      <div className="mt-4 flex items-end gap-1" style={{ height: 60 }}>
        {[35, 55, 45, 70, 55, 85, 65].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-emerald-500/80"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    ),
  },
  {
    title: "Audit Trail",
    description:
      "Every change logged with who, what, and when. Full compliance at your fingertips.",
    icon: Shield,
    span: 2,
    visual: (
      <div className="mt-4 space-y-2 text-xs">
        {[
          { action: "Entry #1042 created", user: "alice", time: "2m ago" },
          { action: "Account updated", user: "bob", time: "15m ago" },
          { action: "Report exported", user: "alice", time: "1h ago" },
        ].map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-md border px-3 py-2"
          >
            <div className="size-2 rounded-full bg-emerald-500" />
            <span className="flex-1 font-medium">{item.action}</span>
            <span className="text-muted-foreground">@{item.user}</span>
            <span className="text-muted-foreground">{item.time}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Bank Integrations",
    description:
      "Connect to thousands of banks for automatic transaction imports and reconciliation.",
    icon: Plug,
    span: 1,
    visual: null,
  },
];

export function BentoFeatures() {
  return (
    <GridBackground variant="lines">
      <section id="features" className="py-20 md:py-28">
        <Container>
          <SectionHeader
            badge="Features"
            title="Everything you need to manage your books"
            subtitle="Powerful double-entry bookkeeping with the developer experience you deserve."
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <ScrollReveal
                key={i}
                delay={i * 0.06}
                className={feature.span === 2 ? "md:col-span-2 lg:col-span-2" : ""}
              >
                <motion.div
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="group relative h-full rounded-xl border bg-card p-6 transition-colors hover:border-emerald-300/50"
                >
                  {/* Dot grid inside card */}
                  <div className="pointer-events-none absolute inset-0 rounded-xl bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] bg-[size:16px_16px] opacity-30" />
                  <div className="relative">
                    <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                      <feature.icon className="size-5" />
                    </div>
                    <h3 className="text-lg font-semibold">{feature.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                    {feature.visual}
                  </div>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </Container>
      </section>
    </GridBackground>
  );
}

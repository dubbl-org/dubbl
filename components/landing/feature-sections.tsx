"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { Container } from "@/components/shared/container";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { GridBackground } from "@/components/shared/grid-background";

function TAccountVisual() {
  const entries = [
    { side: "left", label: "Cash", amount: "+$5,000" },
    { side: "right", label: "Revenue", amount: "+$5,000" },
    { side: "left", label: "Equipment", amount: "+$2,400" },
    { side: "right", label: "Cash", amount: "-$2,400" },
  ];

  return (
    <div className="rounded-xl border bg-card p-6 shadow-lg">
      <div className="mb-4 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        T-Account
      </div>
      <div className="grid grid-cols-2 divide-x">
        <div className="pr-4">
          <div className="mb-2 text-center text-xs font-bold text-emerald-600">
            Debit
          </div>
          {entries
            .filter((e) => e.side === "left")
            .map((e, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.3 + 0.2 }}
                className="mb-2 flex items-center justify-between rounded bg-emerald-50 px-3 py-1.5 text-xs"
              >
                <span>{e.label}</span>
                <span className="font-mono font-bold text-emerald-600">
                  {e.amount}
                </span>
              </motion.div>
            ))}
        </div>
        <div className="pl-4">
          <div className="mb-2 text-center text-xs font-bold text-red-500">
            Credit
          </div>
          {entries
            .filter((e) => e.side === "right")
            .map((e, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.3 + 0.4 }}
                className="mb-2 flex items-center justify-between rounded bg-red-50 px-3 py-1.5 text-xs"
              >
                <span>{e.label}</span>
                <span className="font-mono font-bold text-red-500">
                  {e.amount}
                </span>
              </motion.div>
            ))}
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 1.2 }}
        className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-emerald-50 py-2 text-xs font-medium text-emerald-600"
      >
        <Check className="size-3.5" />
        Always balanced
      </motion.div>
    </div>
  );
}

function ChartVisual() {
  const bars = [
    { label: "Jan", a: 60, b: 40 },
    { label: "Feb", a: 75, b: 45 },
    { label: "Mar", a: 65, b: 50 },
    { label: "Apr", a: 90, b: 55 },
    { label: "May", a: 80, b: 60 },
    { label: "Jun", a: 95, b: 50 },
  ];

  return (
    <div className="rounded-xl border bg-card p-6 shadow-lg">
      <div className="mb-4 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="size-2.5 rounded-sm bg-emerald-500" />
          <span className="text-muted-foreground">Revenue</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="size-2.5 rounded-sm bg-emerald-200" />
          <span className="text-muted-foreground">Expenses</span>
        </div>
      </div>
      <div className="flex items-end gap-3" style={{ height: 120 }}>
        {bars.map((bar, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-end gap-0.5" style={{ height: 100 }}>
              <motion.div
                className="flex-1 rounded-t bg-emerald-500"
                initial={{ height: 0 }}
                whileInView={{ height: `${bar.a}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
              />
              <motion.div
                className="flex-1 rounded-t bg-emerald-200"
                initial={{ height: 0 }}
                whileInView={{ height: `${bar.b}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 + 0.1 }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">
              {bar.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CodeBlockVisual() {
  const code = `curl -X POST https://api.dubbl.dev/v1/entries \\
  -H "Authorization: Bearer sk_live_..." \\
  -d '{
    "date": "2026-03-01",
    "entries": [
      { "account": "cash", "debit": 5000 },
      { "account": "revenue", "credit": 5000 }
    ]
  }'`;

  const [displayedChars, setDisplayedChars] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDisplayedChars((c) => {
        if (c >= code.length) {
          clearInterval(timer);
          return c;
        }
        return c + 2;
      });
    }, 30);
    return () => clearInterval(timer);
  }, [code.length]);

  return (
    <div className="overflow-hidden rounded-xl border bg-zinc-950 shadow-lg">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <div className="size-3 rounded-full bg-red-400" />
        <div className="size-3 rounded-full bg-yellow-400" />
        <div className="size-3 rounded-full bg-green-400" />
        <span className="ml-2 text-xs text-zinc-500">terminal</span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-emerald-400">
        <code>{code.slice(0, displayedChars)}</code>
        <span className="animate-pulse text-emerald-300">|</span>
      </pre>
    </div>
  );
}

const sections = [
  {
    title: "Double-entry, zero confusion",
    description:
      "Every financial transaction is recorded with equal debits and credits. Our system enforces balance at the database level, making accounting errors a thing of the past.",
    bullets: [
      "Automatic balance validation on every entry",
      "Real-time trial balance verification",
      "Multi-leg journal entry support",
      "Immutable audit trail for compliance",
    ],
    visual: <TAccountVisual />,
    bgVariant: "lines" as const,
  },
  {
    title: "Reports that tell the story",
    description:
      "Generate beautiful financial reports instantly. From balance sheets to cash flow statements, get the insights you need to make informed decisions.",
    bullets: [
      "Balance sheet, P&L, and cash flow",
      "Custom date ranges and comparisons",
      "Export to PDF, CSV, and Excel",
      "Scheduled report generation via API",
    ],
    visual: <ChartVisual />,
    bgVariant: "dots" as const,
  },
  {
    title: "API-first, developer-friendly",
    description:
      "Built for developers who want full control. Every feature is accessible via a clean REST API with comprehensive documentation.",
    bullets: [
      "RESTful API with OpenAPI specs",
      "Webhooks for real-time events",
      "SDKs for Python, Node.js, and Go",
      "Idempotent operations for reliability",
    ],
    visual: <CodeBlockVisual />,
    bgVariant: "lines" as const,
  },
];

export function FeatureSections() {
  return (
    <>
      {sections.map((section, i) => (
        <GridBackground key={i} variant={section.bgVariant}>
          <section className="py-20 md:py-28">
            <Container>
              <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                <ScrollReveal
                  direction={i % 2 === 0 ? "left" : "right"}
                  className={i % 2 === 1 ? "lg:order-2" : ""}
                >
                  <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    {section.title}
                  </h2>
                  <p className="mt-4 text-lg text-muted-foreground">
                    {section.description}
                  </p>
                  <ul className="mt-6 space-y-3">
                    {section.bullets.map((bullet, bi) => (
                      <li
                        key={bi}
                        className="flex items-center gap-3 text-sm"
                      >
                        <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                          <Check className="size-3" />
                        </div>
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </ScrollReveal>
                <ScrollReveal
                  direction={i % 2 === 0 ? "right" : "left"}
                  delay={0.15}
                  className={i % 2 === 1 ? "lg:order-1" : ""}
                >
                  {section.visual}
                </ScrollReveal>
              </div>
            </Container>
          </section>
        </GridBackground>
      ))}
    </>
  );
}

"use client";

import { motion } from "motion/react";
import { Container } from "@/components/shared/container";
import { SectionHeader } from "@/components/shared/section-header";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { GitBranch, Terminal, Star, Users, Shield } from "lucide-react";

const cards = [
  {
    id: "api",
    icon: GitBranch,
    label: "API Example",
    content: (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-emerald-500" />
          <span className="font-mono">index.ts</span>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-muted/60 p-4 font-mono text-[13px] leading-relaxed text-foreground">
          <code>
            <span className="text-muted-foreground">{"// Fetch recent entries"}</span>
            {"\n"}
            <span className="text-emerald-600 dark:text-emerald-400">const</span>
            {" entries "}
            <span className="text-muted-foreground">=</span>
            {" "}
            <span className="text-emerald-600 dark:text-emerald-400">await</span>
            {" dubbl.entries."}
            <span className="text-foreground">list</span>
            {"({\n  limit: "}
            <span className="text-amber-600 dark:text-amber-400">10</span>
            {",\n  status: "}
            <span className="text-amber-600 dark:text-amber-400">{'"posted"'}</span>
            {"\n});\n\n"}
            <span className="text-muted-foreground">{"// Each entry is double-entry balanced"}</span>
            {"\n"}
            <span className="text-emerald-600 dark:text-emerald-400">const</span>
            {" total "}
            <span className="text-muted-foreground">=</span>
            {" entries."}
            <span className="text-foreground">reduce</span>
            {"(\n  ("}
            <span className="text-foreground">sum</span>
            {", "}
            <span className="text-foreground">e</span>
            {") "}
            <span className="text-muted-foreground">{"=>"}</span>
            {" sum "}
            <span className="text-muted-foreground">+</span>
            {" e.amount, "}
            <span className="text-amber-600 dark:text-amber-400">0</span>
            {"\n);"}
          </code>
        </pre>
      </div>
    ),
  },
  {
    id: "terminal",
    icon: Terminal,
    label: "Production Stats",
    content: (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-emerald-500" />
          <span className="font-mono">terminal</span>
        </div>
        <div className="rounded-lg bg-muted/60 p-4 font-mono text-[13px] leading-loose text-foreground">
          <p>
            <span className="text-muted-foreground">$</span> dubbl status
            --production
          </p>
          <p className="mt-3 text-muted-foreground">
            ────────────────────────────────
          </p>
          <p>
            <span className="text-emerald-600 dark:text-emerald-400">
              ✓
            </span>{" "}
            12 transactions processed
          </p>
          <p>
            <span className="text-emerald-600 dark:text-emerald-400">
              ✓
            </span>{" "}
            100% accuracy · 0 imbalances
          </p>
          <p>
            <span className="text-emerald-600 dark:text-emerald-400">
              ✓
            </span>{" "}
            P95 latency: 12ms
          </p>
          <p>
            <span className="text-emerald-600 dark:text-emerald-400">
              ✓
            </span>{" "}
            Uptime: 99.99% (last 90 days)
          </p>
          <p className="mt-3 text-muted-foreground">
            ────────────────────────────────
          </p>
          <p className="text-muted-foreground">
            All systems operational.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "github",
    icon: Star,
    label: "Open Source",
    content: (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block size-2 rounded-full bg-emerald-500" />
          <span className="font-mono">dubbl-org/dubbl</span>
        </div>
        <div className="rounded-lg bg-muted/60 p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="flex items-center justify-center gap-1.5">
                <Star className="size-4 text-amber-500" />
                <span className="text-lg font-bold text-foreground">0</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Stars</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1.5">
                <Users className="size-4 text-muted-foreground" />
                <span className="text-lg font-bold text-foreground">1</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Contributors</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1.5">
                <Shield className="size-4 text-muted-foreground" />
                <span className="text-lg font-bold text-foreground">Apache</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">License</p>
            </div>
          </div>

          <div className="mt-5 space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Latest release</span>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                v0.1.0
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last commit</span>
              <span className="font-mono text-xs text-foreground">2 hours ago</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Open issues</span>
              <span className="font-mono text-xs text-foreground">0</span>
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Language breakdown
            </p>
            <div className="flex h-2 overflow-hidden rounded-full">
              <div className="bg-blue-500" style={{ width: "78%" }} />
              <div className="bg-amber-500" style={{ width: "14%" }} />
              <div className="bg-emerald-500" style={{ width: "8%" }} />
            </div>
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full bg-blue-500" />
                TypeScript 78%
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full bg-amber-500" />
                CSS 14%
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full bg-emerald-500" />
                Other 8%
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
];

export function Testimonials() {
  return (
    <section id="community" className="py-16 md:py-20">
      <Container>
        <SectionHeader
          badge="Trusted by developers"
          title="Built with the community"
          subtitle="Open source, battle-tested, and designed for production workloads."
        />

        <div className="grid gap-6 md:grid-cols-3">
          {cards.map((card, i) => (
            <ScrollReveal key={card.id} delay={i * 0.1}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="h-full rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                    <card.icon className="size-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {card.label}
                  </span>
                </div>
                {card.content}
              </motion.div>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

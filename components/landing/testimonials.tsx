"use client";

import { motion } from "motion/react";
import { Container } from "@/components/shared/container";
import { SectionHeader } from "@/components/shared/section-header";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { Terminal, Code2, Package } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Code Cards                                                         */
/* ------------------------------------------------------------------ */

function APICodeCard() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-[#0a0a0a] dark:bg-black">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
        <Code2 className="size-3.5 text-emerald-400" />
        <span className="font-mono text-[11px] text-white/40">index.ts</span>
      </div>
      {/* Code body */}
      <div className="flex-1 px-5 py-5 font-mono text-[13px] leading-relaxed">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: false }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <p className="text-white/40">{"// Fetch recent transactions"}</p>
          <p>
            <span className="text-emerald-400">const</span>
            <span className="text-white"> entries </span>
            <span className="text-white/40">=</span>
            <span className="text-emerald-400"> await</span>
            <span className="text-white">{" dubbl.entries."}</span>
            <span className="text-white">list</span>
            <span className="text-white/60">{"({"}</span>
          </p>
          <p className="pl-4">
            <span className="text-white/60">limit: </span>
            <span className="text-amber-400">10</span>
            <span className="text-white/40">,</span>
          </p>
          <p className="pl-4">
            <span className="text-white/60">status: </span>
            <span className="text-amber-400">{'"posted"'}</span>
          </p>
          <p className="text-white/60">{"});"}</p>
          <p className="mt-4 text-white/40">
            {"// Each entry is double-entry balanced"}
          </p>
          <p>
            <span className="text-emerald-400">const</span>
            <span className="text-white"> total </span>
            <span className="text-white/40">=</span>
            <span className="text-white">{" entries."}</span>
            <span className="text-white">reduce</span>
            <span className="text-white/60">{"("}</span>
          </p>
          <p className="pl-4">
            <span className="text-white/60">{"("}</span>
            <span className="text-white">sum</span>
            <span className="text-white/60">{", "}</span>
            <span className="text-white">e</span>
            <span className="text-white/60">{")"}</span>
            <span className="text-white/40">{" =>"}</span>
            <span className="text-white"> sum </span>
            <span className="text-white/40">+</span>
            <span className="text-white"> e.amount</span>
            <span className="text-white/40">,</span>
            <span className="text-amber-400"> 0</span>
          </p>
          <p className="text-white/60">{");"}</p>
        </motion.div>
      </div>
    </div>
  );
}

function DockerCard() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-[#0a0a0a] dark:bg-black">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
        <Terminal className="size-3.5 text-emerald-400" />
        <span className="font-mono text-[11px] text-white/40">self-host</span>
      </div>
      {/* Body */}
      <div className="flex-1 px-5 py-5 font-mono text-[13px] leading-loose">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: false }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <p className="text-white/60">
            <span className="text-white/40">$</span> docker compose up -d
          </p>
          <p className="text-emerald-400">
            {"  ✓ Container dubbl-db    Started"}
          </p>
          <p className="text-emerald-400">
            {"  ✓ Container dubbl-app   Started"}
          </p>
          <p className="mt-2 text-white font-medium">
            {"  dubbl running at localhost:3000"}
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function SDKCard() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-[#0a0a0a] dark:bg-black">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
        <Package className="size-3.5 text-emerald-400" />
        <span className="font-mono text-[11px] text-white/40">sdk</span>
      </div>
      {/* Body */}
      <div className="flex-1 px-5 py-5 font-mono text-[13px] leading-loose">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: false }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <p className="text-white/60">
            <span className="text-white/40">$</span> npm install @dubbl/sdk
          </p>
          <p className="mt-3">
            <span className="text-emerald-400">import</span>
            <span className="text-white/60">{" { "}</span>
            <span className="text-white">Dubbl</span>
            <span className="text-white/60">{" } "}</span>
            <span className="text-emerald-400">from</span>
            <span className="text-amber-400">{' "@dubbl/sdk"'}</span>
            <span className="text-white/40">;</span>
          </p>
          <p>
            <span className="text-emerald-400">const</span>
            <span className="text-white"> client </span>
            <span className="text-white/40">=</span>
            <span className="text-emerald-400"> new</span>
            <span className="text-white">{" Dubbl"}</span>
            <span className="text-white/60">{"();"}</span>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Feature Badges                                                     */
/* ------------------------------------------------------------------ */

const badges = [
  "TypeScript SDK",
  "REST API",
  "Webhooks",
  "Self-hostable",
  "Apache 2.0",
];

/* ------------------------------------------------------------------ */
/*  Exported Component                                                 */
/* ------------------------------------------------------------------ */

export function Testimonials() {
  return (
    <section id="community" className="py-16 md:py-20">
      <Container>
        <SectionHeader
          badge="Developer Experience"
          title="Built API-first"
          subtitle="Every feature accessible via REST API. Self-host, extend, and integrate with anything."
        />

        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          {/* Left — API code example */}
          <ScrollReveal delay={0}>
            <APICodeCard />
          </ScrollReveal>

          {/* Right — stacked cards */}
          <div className="flex flex-col gap-5">
            <ScrollReveal delay={0.1}>
              <DockerCard />
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <SDKCard />
            </ScrollReveal>
          </div>
        </div>

        {/* Badges row */}
        <ScrollReveal delay={0.3}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {badges.map((badge, i) => (
              <motion.span
                key={badge}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false }}
                transition={{ delay: 0.4 + i * 0.06, duration: 0.3 }}
                className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
              >
                {badge}
              </motion.span>
            ))}
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}

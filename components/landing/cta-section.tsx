"use client";

import { ArrowRight } from "lucide-react";
import { Container } from "@/components/shared/container";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import Link from "next/link";

export function CTASection() {
  return (
    <section className="relative overflow-hidden bg-[#0a0a0a] py-16 text-white md:py-20">
      {/* Blueprint hash overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "repeating-linear-gradient(-45deg, transparent, transparent 5px, #fff 5px, #fff 5.5px)" }} />

      {/* Decorative dashed elements */}

      {/* Top-left dashed rectangle */}
      <div className="absolute -left-16 -top-12 size-64 rounded-2xl border-2 border-dashed border-emerald-500/20">
        <div className="absolute -left-1 -top-1 size-2 rounded-full bg-emerald-500" />
        <div className="absolute -right-1 -top-1 size-2 rounded-full bg-emerald-500" />
        <div className="absolute -bottom-1 -left-1 size-2 rounded-full bg-emerald-500" />
        <div className="absolute -bottom-1 -right-1 size-2 rounded-full bg-emerald-500" />
      </div>

      {/* Center-right dashed square */}
      <div className="absolute -right-20 top-1/2 size-48 -translate-y-1/2 rounded-2xl border-2 border-dashed border-emerald-500/20">
        <div className="absolute -left-1 -top-1 size-2 rounded-full bg-emerald-500" />
        <div className="absolute -right-1 -top-1 size-2 rounded-full bg-emerald-500" />
        <div className="absolute -bottom-1 -left-1 size-2 rounded-full bg-emerald-500" />
        <div className="absolute -bottom-1 -right-1 size-2 rounded-full bg-emerald-500" />
      </div>

      {/* Bottom-left dashed rectangle */}
      <div className="absolute -bottom-16 left-24 h-40 w-56 rounded-2xl border-2 border-dashed border-emerald-500/20">
        <div className="absolute -left-1 -top-1 size-2 rounded-full bg-emerald-500" />
        <div className="absolute -right-1 -top-1 size-2 rounded-full bg-emerald-500" />
        <div className="absolute -bottom-1 -left-1 size-2 rounded-full bg-emerald-500" />
        <div className="absolute -bottom-1 -right-1 size-2 rounded-full bg-emerald-500" />
      </div>

      {/* Subtle gradient glow behind text */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="h-[400px] w-[600px] rounded-full bg-emerald-500/10 blur-[120px]" />
      </div>

      <Container className="relative">
        <ScrollReveal>
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
              Start managing your books today
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/60">
              Self-host in minutes, extend via API, and own your financial
              data. Forever free.
            </p>
            <p className="mt-6 text-sm text-white/40">
              Open source &middot; Self-hostable &middot; Free forever
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/sign-up"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-8 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
              >
                Get Started
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/20 px-8 text-sm font-medium text-white transition-colors hover:bg-white/5"
              >
                Contact Sales
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}

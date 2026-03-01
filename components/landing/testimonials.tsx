"use client";

import { Container } from "@/components/shared/container";
import { SectionHeader } from "@/components/shared/section-header";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

const testimonials = [
  {
    quote:
      "dubbl replaced our entire accounting stack. The API-first approach meant we could integrate it into our workflow in a single afternoon.",
    name: "Sarah Chen",
    role: "CTO at FlowMetrics",
    initials: "SC",
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    quote:
      "Finally, bookkeeping software that developers actually enjoy using. The double-entry enforcement has caught errors our old system never would.",
    name: "Marcus Rivera",
    role: "Lead Engineer at Stackwise",
    initials: "MR",
    color: "bg-blue-100 text-blue-700",
  },
  {
    quote:
      "We self-host dubbl for our fintech startup. Having full control over our financial data with zero vendor lock-in is invaluable.",
    name: "Aisha Patel",
    role: "Founder at LedgerLoop",
    initials: "AP",
    color: "bg-amber-100 text-amber-700",
  },
  {
    quote:
      "The multi-currency support is flawless. We operate in 12 countries and dubbl handles all the complexity without breaking a sweat.",
    name: "Erik Johansson",
    role: "Finance Director at NordPay",
    initials: "EJ",
    color: "bg-purple-100 text-purple-700",
  },
  {
    quote:
      "I contributed a feature on Monday and it was merged by Wednesday. The community is incredibly responsive and welcoming.",
    name: "Priya Sharma",
    role: "Open Source Contributor",
    initials: "PS",
    color: "bg-rose-100 text-rose-700",
  },
  {
    quote:
      "dubbl's audit trail saved us during our last compliance review. Every transaction change is tracked with full accountability.",
    name: "James O'Sullivan",
    role: "CFO at AuditReady",
    initials: "JO",
    color: "bg-teal-100 text-teal-700",
  },
  {
    quote:
      "We migrated from QuickBooks to dubbl in two weeks. The import tools and documentation made it surprisingly painless.",
    name: "Lin Zhao",
    role: "Engineering Manager at BookBase",
    initials: "LZ",
    color: "bg-indigo-100 text-indigo-700",
  },
  {
    quote:
      "The webhooks and event system let us build real-time dashboards that update the moment a transaction is recorded. Incredible DX.",
    name: "Rachel Kim",
    role: "Senior Developer at PayStream",
    initials: "RK",
    color: "bg-orange-100 text-orange-700",
  },
];

export function Testimonials() {
  return (
    <section id="community" className="bg-muted/30 py-20 md:py-28">
      <Container>
        <SectionHeader
          badge="Community"
          title="Loved by developers"
          subtitle="Join thousands of developers and finance teams using dubbl worldwide."
        />

        <div className="columns-1 gap-4 space-y-4 md:columns-2 lg:columns-3">
          {testimonials.map((t, i) => (
            <ScrollReveal key={i} delay={i * 0.05}>
              <div className="break-inside-avoid rounded-xl border bg-card p-6">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div
                    className={`flex size-9 items-center justify-center rounded-full text-xs font-bold ${t.color}`}
                  >
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

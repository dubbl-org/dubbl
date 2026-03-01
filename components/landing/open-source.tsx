"use client";

import { Github, Heart, GitFork } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { SectionHeader } from "@/components/shared/section-header";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { GridBackground } from "@/components/shared/grid-background";

function ContributionGraph() {
  // Generate a mock contribution grid (52 weeks x 7 days)
  const weeks = 26;
  const days = 7;
  const cells: number[] = [];
  // Pseudo-random seeded pattern
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < days; d++) {
      const val = Math.sin(w * 0.7 + d * 1.3) * 0.5 + 0.5;
      if (val < 0.3) cells.push(0);
      else if (val < 0.5) cells.push(1);
      else if (val < 0.7) cells.push(2);
      else if (val < 0.85) cells.push(3);
      else cells.push(4);
    }
  }

  const opacityMap = ["bg-emerald-100", "bg-emerald-200", "bg-emerald-300", "bg-emerald-400", "bg-emerald-600"];

  return (
    <div className="overflow-hidden rounded-xl border bg-card p-6 shadow-lg">
      <div className="mb-4 text-xs font-medium text-muted-foreground">
        Contribution activity
      </div>
      <div
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: `repeat(${weeks}, 1fr)`,
          gridTemplateRows: `repeat(${days}, 1fr)`,
        }}
      >
        {cells.map((level, i) => (
          <div
            key={i}
            className={`aspect-square rounded-[2px] ${opacityMap[level]}`}
            style={{
              animationDelay: `${(i % weeks) * 50}ms`,
            }}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
        Less
        {opacityMap.map((cls, i) => (
          <div key={i} className={`size-2.5 rounded-[2px] ${cls}`} />
        ))}
        More
      </div>
    </div>
  );
}

export function OpenSource() {
  return (
    <GridBackground variant="lines">
      <section id="open-source" className="py-20 md:py-28">
        <Container>
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <ScrollReveal>
              <SectionHeader
                badge="Open Source"
                title="Fork it. Extend it. Own it."
                subtitle="dubbl is fully open source under the Apache 2.0 license. No vendor lock-in, no hidden fees, no surprises."
                align="left"
              />

              <div className="mt-8 grid grid-cols-3 gap-4">
                {[
                  { label: "Contributors", value: 48, suffix: "+" },
                  { label: "Stars", value: 2400, suffix: "+" },
                  { label: "Commits", value: 1200, suffix: "+" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center">
                    <div className="text-2xl font-bold sm:text-3xl">
                      <AnimatedCounter
                        target={stat.value}
                        suffix={stat.suffix}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  asChild
                >
                  <a
                    href="https://github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github className="size-4" />
                    View Repository
                  </a>
                </Button>
                <Button variant="outline" size="lg">
                  <Heart className="size-4" />
                  Sponsor
                </Button>
                <Button variant="outline" size="lg">
                  <GitFork className="size-4" />
                  Fork
                </Button>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={0.15} direction="right">
              <ContributionGraph />
            </ScrollReveal>
          </div>
        </Container>
      </section>
    </GridBackground>
  );
}

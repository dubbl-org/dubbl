"use client";

import { motion } from "motion/react";
import { Github, Heart, GitFork, Users, Star, GitCommit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/shared/container";
import { SectionHeader } from "@/components/shared/section-header";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { AnimatedCounter } from "@/components/shared/animated-counter";

/* ------------------------------------------------------------------ */
/*  Contribution Graph — GitHub-style minimal grid                     */
/* ------------------------------------------------------------------ */

function ContributionGraph() {
  const weeks = 52;
  const days = 7;
  const cells: number[] = [];

  // Deterministic pseudo-random contribution data
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < days; d++) {
      const seed = Math.sin(w * 0.45 + d * 1.7 + w * d * 0.03) * 0.5 + 0.5;
      // Weight recent weeks (higher index) to have more activity
      const recencyBoost = w / weeks;
      const val = seed * 0.6 + recencyBoost * 0.4;

      if (val < 0.2) cells.push(0);
      else if (val < 0.38) cells.push(1);
      else if (val < 0.55) cells.push(2);
      else if (val < 0.72) cells.push(3);
      else cells.push(4);
    }
  }

  const colorMap = [
    "bg-muted/80 dark:bg-muted/40",
    "bg-emerald-200 dark:bg-emerald-900/70",
    "bg-emerald-300 dark:bg-emerald-700/80",
    "bg-emerald-400 dark:bg-emerald-500",
    "bg-emerald-600 dark:bg-emerald-400",
  ];

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Month labels */}
      <div className="mb-2 flex">
        <div className="w-8 shrink-0" />
        <div className="flex flex-1 justify-between px-0.5">
          {months.map((m) => (
            <span
              key={m}
              className="text-[10px] text-muted-foreground/60"
            >
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* Grid with day labels */}
      <div className="flex gap-1.5">
        {/* Day labels */}
        <div className="flex w-6 shrink-0 flex-col justify-between py-0.5">
          {["Mon", "", "Wed", "", "Fri", "", ""].map((label, i) => (
            <span key={i} className="text-[9px] leading-none text-muted-foreground/50">
              {label}
            </span>
          ))}
        </div>

        {/* Cells */}
        <div
          className="flex-1"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${weeks}, 1fr)`,
            gridTemplateRows: `repeat(${days}, 1fr)`,
            gap: "3px",
          }}
        >
          {cells.map((level, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.5 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: false }}
              transition={{
                delay: 0.01 * (i % weeks),
                duration: 0.2,
                ease: "easeOut",
              }}
              className={`aspect-square rounded-[3px] ${colorMap[level]}`}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-end gap-1.5">
        <span className="text-[10px] text-muted-foreground/50">Less</span>
        {colorMap.map((cls, i) => (
          <div key={i} className={`size-[10px] rounded-[2px] ${cls}`} />
        ))}
        <span className="text-[10px] text-muted-foreground/50">More</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats                                                              */
/* ------------------------------------------------------------------ */

const stats = [
  {
    label: "Contributors",
    value: 1,
    suffix: "",
    icon: Users,
  },
  {
    label: "Stars",
    value: 0,
    suffix: "",
    icon: Star,
  },
  {
    label: "Commits",
    value: 3,
    suffix: "",
    icon: GitCommit,
  },
];

/* ------------------------------------------------------------------ */
/*  Exported component                                                 */
/* ------------------------------------------------------------------ */

export function OpenSource() {
  return (
    <section id="open-source" className="py-16 md:py-24">
      <Container>
        <ScrollReveal>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="grid items-stretch lg:grid-cols-[1fr_1.1fr]">
              {/* ---- Left: Text Content ---- */}
              <div className="flex flex-col justify-center p-8 md:p-10 lg:p-12">
                <SectionHeader
                  badge="Open Source"
                  title="Fork it. Extend it. Own it."
                  subtitle="dubbl is fully open source under the Apache 2.0 license. No vendor lock-in, no hidden fees, no surprises. Your data, your rules."
                  align="left"
                  className="mb-8 md:mb-10"
                />

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-4 sm:gap-6">
                  {stats.map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: false }}
                      transition={{
                        delay: 0.2 + i * 0.08,
                        duration: 0.4,
                        ease: "easeOut",
                      }}
                      className="flex flex-col"
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <div className="flex size-7 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-950/50">
                          <stat.icon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                        <AnimatedCounter
                          target={stat.value}
                          suffix={stat.suffix}
                        />
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {stat.label}
                      </p>
                    </motion.div>
                  ))}
                </div>

                {/* Buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: false }}
                  transition={{ delay: 0.45, duration: 0.4, ease: "easeOut" }}
                  className="mt-8 flex flex-col gap-3 sm:flex-row"
                >
                  <Button
                    size="lg"
                    className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                    asChild
                  >
                    <a
                      href="https://github.com/dubbl-org/dubbl"
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
                </motion.div>
              </div>

              {/* ---- Right: Contribution Graph ---- */}
              <div className="border-t border-border bg-muted/20 p-6 md:p-8 lg:border-t-0 lg:border-l lg:p-10">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-foreground">
                    Contribution activity
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    52 weeks of active development
                  </p>
                </div>
                <ContributionGraph />
              </div>
            </div>
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}

"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Container } from "@/components/shared/container";
import { OrbitalDecoration } from "@/components/shared/orbital-decoration";
import { GrainGradient } from "@paper-design/shaders-react";
import { BookOpen, Server, Code2, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  { text: "Double-entry", icon: BookOpen },
  { text: "Self-hosted", icon: Server },
  { text: "API-first", icon: Code2 },
];

const marqueeRows: { size: "lg" | "md" | "sm"; pills: string[] }[] = [
  { size: "md", pills: ["Invoice #2847 sent", "Revenue recognized", "Bank feed synced", "Journal posted", "AP aging 30d", "Reconciled"] },
  { size: "sm", pills: ["Categorized", "Matched", "Approved", "Exported", "Voided", "Accrued", "Settled", "Tagged"] },
  { size: "lg", pills: ["Stripe deposit $4,200", "Payroll batch complete", "Q4 close ready", "AR collected $12,580"] },
  { size: "sm", pills: ["USD", "EUR", "Multi-entity", "1099-ready", "Audit trail", "CSV import", "GAAP", "Double-entry"] },
  { size: "md", pills: ["Chase auto-synced", "Plaid connected", "Mercury linked", "Wise integrated", "Brex reconciled"] },
  { size: "sm", pills: ["Posted", "Pending", "Cleared", "Balanced", "Verified", "Locked", "Synced", "Closed"] },
  { size: "lg", pills: ["P&L report generated", "Balance sheet ready", "Trial balance clean", "Cash flow projected"] },
  { size: "md", pills: ["Tax provision set", "Depreciation run", "Interco eliminated", "Prepaid amortized", "Accruals reversed"] },
  { size: "sm", pills: ["API", "Webhook", "REST", "Batch", "Real-time", "Async", "Scheduled", "Streaming"] },
];

const marqueeSizeClasses = {
  lg: "px-4 py-2 text-[11px]",
  md: "px-3 py-1.5 text-[10px]",
  sm: "px-2 py-1 text-[8px]",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* Background effects */}
      <div className="noise-overlay pointer-events-none fixed inset-0 z-0" />
      <div className="pointer-events-none fixed inset-0 z-0 gradient-mesh" />

      {/* Animated orbital SVGs */}
      <OrbitalDecoration className="fixed -right-[10%] -top-[15%] z-0 h-[800px] w-[800px] lg:h-[900px] lg:w-[900px]" />
      <OrbitalDecoration className="fixed -bottom-[20%] -left-[12%] z-0 h-[600px] w-[600px] rotate-180 lg:h-[700px] lg:w-[700px]" />

      {/* Container edge lines */}
      <div className="pointer-events-none fixed inset-0 z-[60] flex justify-center">
        <div className="w-full max-w-[1400px]">
          <div className="relative h-full">
            <div className="absolute inset-y-0 left-0 w-px bg-foreground/10" />
            <div className="absolute inset-y-0 right-0 w-px bg-foreground/10" />
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="relative z-20">
        <Container className="flex items-center justify-between py-5">
          <Link href="/" className="inline-flex items-center gap-2">
            <Logo />
            <span className="text-lg font-bold tracking-tight text-foreground">
              dubbl
            </span>
          </Link>
          <ThemeToggle />
        </Container>
      </header>

      {/* Main */}
      <main className="relative z-10 flex flex-1 items-center justify-center pb-8">
        <Container>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/5 dark:shadow-black/40">
            {/* Mobile grain gradient banner */}
            <div className="relative overflow-hidden lg:hidden">
              <GrainGradient
                className="pointer-events-none !absolute !inset-0 !rounded-none"
                width="100%"
                height="100%"
                colors={["#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#34d399", "#a7f3d0"]}
                colorBack="#34d399"
                softness={1}
                intensity={0.8}
                noise={0.9}
                shape="wave"
                scale={3.5}
                speed={0.2}
              />
              <div className="relative flex flex-col items-center gap-1.5 py-8">
                <svg
                  viewBox="0 0 40 32"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-auto"
                >
                  <path
                    d="M18 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10h-8V4z"
                    fill="white"
                    fillOpacity="0.35"
                  />
                  <path
                    d="M4 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10H4V4z"
                    fill="white"
                    fillOpacity="0.9"
                  />
                </svg>
                <span className="text-lg font-bold tracking-tight text-white">
                  dubbl
                </span>
                <p className="text-xs text-white/60">
                  Open source bookkeeping, done right
                </p>
              </div>
            </div>

            <div className="grid lg:grid-cols-[1.2fr_1fr]">
              {/* ---- Left: grain gradient showcase ---- */}
              <div className="relative hidden overflow-hidden border-r border-white/10 lg:block">
                {/* Green grain gradient background */}
                <GrainGradient
                  className="pointer-events-none !absolute !inset-0 !rounded-none"
                  width="100%"
                  height="100%"
                  colors={["#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#34d399", "#a7f3d0"]}
                  colorBack="#34d399"
                  softness={1}
                  intensity={0.8}
                  noise={0.9}
                  shape="wave"
                  scale={3.5}
                  speed={0.2}
                />

                {/* Subtle depth vignette */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_50%,transparent_30%,rgba(0,0,0,0.1)_100%)]" />

                {/* Marquee rows filling the panel */}
                <div
                  className="absolute inset-0 z-[1] flex flex-col justify-evenly overflow-hidden py-6"
                  style={{
                    maskImage:
                      "radial-gradient(ellipse 70% 45% at 50% 50%, transparent 25%, black 70%)",
                    WebkitMaskImage:
                      "radial-gradient(ellipse 70% 45% at 50% 50%, transparent 25%, black 70%)",
                  }}
                >
                  {marqueeRows.map((row, rowIdx) => {
                    const duration = 22 + (rowIdx % 4) * 7;
                    const reverse = rowIdx % 2 === 1;
                    const sizeClass = marqueeSizeClasses[row.size];
                    return (
                      <div key={rowIdx} className="relative flex overflow-hidden">
                        <div
                          className="flex shrink-0 items-center gap-2"
                          style={{
                            animation: `auth-marquee-${reverse ? "rev" : "fwd"} ${duration}s linear infinite`,
                          }}
                        >
                          {[...row.pills, ...row.pills, ...row.pills, ...row.pills].map((pill, j) => {
                            const isFeatured =
                              pill.includes("$") ||
                              pill.includes("ready") ||
                              pill.includes("complete") ||
                              pill.includes("clean");
                            return (
                              <span
                                key={j}
                                className={cn(
                                  "shrink-0 whitespace-nowrap rounded-full font-medium text-white/70 backdrop-blur-sm",
                                  sizeClass,
                                  isFeatured
                                    ? "border border-white/20 bg-white/15 text-white/90"
                                    : "bg-white/[0.08]"
                                )}
                              >
                                {pill}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Center brand card */}
                <div className="relative z-[2] flex h-full items-center justify-center">
                  <motion.div
                    className="relative flex flex-col items-center"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.6, delay: 0.15 }}
                  >
                    {/* Pulsing emerald glow */}
                    <motion.div
                      className="absolute -inset-10 rounded-full bg-emerald-400/20 blur-3xl"
                      animate={{ opacity: [0.4, 0.7, 0.4], scale: [0.95, 1.05, 0.95] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    />

                    {/* Frosted card */}
                    <div className="relative rounded-2xl border border-white/20 bg-white/10 px-10 py-8 shadow-2xl shadow-black/10 backdrop-blur-xl">
                      <div className="flex flex-col items-center gap-3">
                        <svg
                          viewBox="0 0 40 32"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-10 w-auto"
                        >
                          <path
                            d="M18 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10h-8V4z"
                            fill="white"
                            fillOpacity="0.35"
                          />
                          <path
                            d="M4 4h8a10 10 0 0 1 10 10v4a10 10 0 0 1-10 10H4V4z"
                            fill="white"
                            fillOpacity="0.9"
                          />
                        </svg>
                        <span className="text-2xl font-bold tracking-tight text-white">
                          dubbl
                        </span>
                      </div>
                    </div>

                    {/* Feature badges below card */}
                    <div className="mt-5 flex items-center gap-2">
                      {features.map(({ text, icon: Icon }) => (
                        <div
                          key={text}
                          className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 backdrop-blur-sm"
                        >
                          <Icon className="size-3 text-white/70" />
                          <span className="text-[10px] font-medium text-white/70">
                            {text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </div>

                {/* Marquee keyframes */}
                <style>{`
                  @keyframes auth-marquee-fwd {
                    from { transform: translateX(0); }
                    to { transform: translateX(-25%); }
                  }
                  @keyframes auth-marquee-rev {
                    from { transform: translateX(-25%); }
                    to { transform: translateX(0); }
                  }
                `}</style>
              </div>

              {/* ---- Right: form panel ---- */}
              <div className="relative flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-12 lg:py-12">
                <div className="mx-auto w-full max-w-sm">{children}</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-5 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
            <Link
              href="/"
              className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground"
            >
              Home
              <ArrowUpRight className="size-3" />
            </Link>
            <span className="text-border">&middot;</span>
            <span>Trusted by teams worldwide</span>
          </div>
        </Container>
      </main>
    </div>
  );
}

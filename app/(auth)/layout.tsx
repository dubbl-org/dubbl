import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Container } from "@/components/shared/container";
import { OrbitalDecoration } from "@/components/shared/orbital-decoration";
import {
  BookOpen,
  Server,
  Code2,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

const features = [
  { text: "Double-entry", icon: BookOpen },
  { text: "Self-hosted", icon: Server },
  { text: "API-first", icon: Code2 },
];

const stats = [
  { label: "Revenue", value: "$48,250", change: "+12.5%", up: true },
  { label: "Expenses", value: "$12,840", change: "-3.2%", up: false },
  { label: "Net Income", value: "$35,410", change: "+18.1%", up: true },
];

const ledgerRows = [
  { date: "Mar 01", desc: "Client Payment — Acme Corp", debit: "—", credit: "$12,500.00", bal: "$48,250.00" },
  { date: "Feb 28", desc: "Office Lease — Q1", debit: "$4,200.00", credit: "—", bal: "$35,750.00" },
  { date: "Feb 27", desc: "Software License — Figma", debit: "$75.00", credit: "—", bal: "$39,950.00" },
  { date: "Feb 26", desc: "Consulting Revenue", debit: "—", credit: "$8,500.00", bal: "$40,025.00" },
  { date: "Feb 25", desc: "Payroll — February", debit: "$15,200.00", credit: "—", bal: "$31,525.00" },
  { date: "Feb 24", desc: "Cloud Hosting — AWS", debit: "$890.00", credit: "—", bal: "$46,725.00" },
];

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

      {/* Animated orbital SVGs — same as hero */}
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

      {/* Header — uses Container so edges align with card */}
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

      {/* Main — same Container so card edges match header */}
      <main className="relative z-10 flex flex-1 items-center justify-center pb-8">
        <Container>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/5 dark:shadow-black/40">
            <div className="grid lg:grid-cols-[1.2fr_1fr]">
              {/* ---- Left: visual showcase ---- */}
              <div className="relative hidden overflow-hidden border-r border-border lg:block">
                {/* Blueprint hash */}
                <div className="blueprint-hash absolute inset-0 opacity-20" />
                {/* Emerald gradient wash */}
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.04] via-transparent to-teal-500/[0.03]" />

                <div className="relative z-10 flex h-full flex-col p-7">
                  {/* Badge + headline */}
                  <div className="mb-5">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
                      <span className="relative flex size-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                      </span>
                      Open Source &middot; Apache 2.0
                    </div>
                    <h2 className="mt-3.5 text-xl font-bold leading-snug tracking-tight text-foreground">
                      Open source bookkeeping,{" "}
                      <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent dark:from-emerald-400 dark:to-teal-300">
                        done right.
                      </span>
                    </h2>
                  </div>

                  {/* Stat cards */}
                  <div className="mb-4 grid grid-cols-3 gap-2">
                    {stats.map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-lg border border-border bg-background/60 p-2.5 backdrop-blur-sm"
                      >
                        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                          {stat.label}
                        </p>
                        <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">
                          {stat.value}
                        </p>
                        <div className="mt-0.5 flex items-center gap-0.5">
                          {stat.up ? (
                            <TrendingUp className="size-2.5 text-emerald-500" />
                          ) : (
                            <TrendingDown className="size-2.5 text-emerald-500" />
                          )}
                          <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                            {stat.change}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* General ledger mockup */}
                  <div className="flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                    {/* Window chrome */}
                    <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-3 py-2">
                      <div className="size-2 rounded-full bg-[#ff5f57]" />
                      <div className="size-2 rounded-full bg-[#febc2e]" />
                      <div className="size-2 rounded-full bg-[#28c840]" />
                      <span className="ml-2 text-[10px] font-medium text-muted-foreground">
                        General Ledger
                      </span>
                    </div>

                    {/* Header row */}
                    <div className="grid grid-cols-[48px_1fr_76px_80px_82px] gap-0.5 border-b border-border bg-muted/30 px-2.5 py-1.5 text-[8px] font-medium uppercase tracking-wider text-muted-foreground">
                      <span>Date</span>
                      <span>Description</span>
                      <span className="text-right">Debit</span>
                      <span className="text-right">Credit</span>
                      <span className="text-right">Balance</span>
                    </div>

                    {/* Data rows */}
                    {ledgerRows.map((row, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[48px_1fr_76px_80px_82px] gap-0.5 border-b border-border/40 px-2.5 py-1.5 text-[9px] last:border-0"
                      >
                        <span className="text-muted-foreground">
                          {row.date}
                        </span>
                        <span className="truncate font-medium text-foreground">
                          {row.desc}
                        </span>
                        <span className="text-right tabular-nums text-muted-foreground">
                          {row.debit}
                        </span>
                        <span
                          className={`text-right tabular-nums font-medium ${
                            row.credit !== "—"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {row.credit}
                        </span>
                        <span className="text-right tabular-nums font-medium text-foreground">
                          {row.bal}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Feature badges */}
                  <div className="mt-4 flex items-center gap-3">
                    {features.map(({ text, icon: Icon }) => (
                      <div
                        key={text}
                        className="flex items-center gap-1.5 rounded-md border border-border bg-background/50 px-2 py-1 backdrop-blur-sm"
                      >
                        <Icon className="size-3 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ---- Right: form panel ---- */}
              <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-12 lg:py-12">
                {/* Mobile logo */}
                <div className="mb-8 flex flex-col items-center gap-2 lg:hidden">
                  <Link href="/" className="flex items-center gap-2">
                    <Logo />
                    <span className="text-lg font-bold tracking-tight text-foreground">
                      dubbl
                    </span>
                  </Link>
                </div>

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

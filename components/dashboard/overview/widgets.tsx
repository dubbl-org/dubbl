"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkline } from "@/components/dashboard/sparkline";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/** One colour per kind of money, used for dots, bars and lines across the overview. */
export const TONE = {
  cash: "#0EA5E9",
  moneyIn: "#10B981",
  moneyOut: "#F97316",
  profit: "#1C1C1B",
  owedToYou: "#F59E0B",
  youOwe: "#8B5CF6",
  late: "#EF4444",
} as const;

/** For lists of things that need telling apart (accounts, expense categories). */
export const SERIES = ["#0EA5E9", "#10B981", "#F59E0B", "#8B5CF6", "#F97316", "#EC4899"];

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border/80 bg-card", className)}>{children}</div>
  );
}

export function InfoTip({ children }: { children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="What does this mean?" className="text-muted-foreground/45 transition-colors hover:text-muted-foreground">
          <CircleHelp className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-[12.5px] leading-snug">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export function CardHeader({
  title,
  hint,
  aside,
  href,
  linkLabel = "View all",
}: {
  title: string;
  hint?: ReactNode;
  aside?: ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
      {hint && <InfoTip>{hint}</InfoTip>}
      <div className="ml-auto flex items-center gap-3">
        {aside}
        {href && (
          <Link href={href} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            {linkLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

export function Stat({
  label,
  hint,
  value,
  note,
  tone,
  spark,
  negative,
  href,
}: {
  label: string;
  hint: ReactNode;
  value: string;
  note: ReactNode;
  tone: string;
  spark?: number[];
  negative?: boolean;
  href?: string;
}) {
  const body = (
    <Card className={cn("h-full px-[18px] py-4", href && "transition-colors hover:border-foreground/15")}>
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ backgroundColor: tone }} />
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <InfoTip>{hint}</InfoTip>
      </div>
      <div className="mt-2.5 flex items-end justify-between gap-3">
        <p
          className={cn(
            "truncate text-[24px] font-semibold leading-none tracking-[-0.025em] tabular-nums",
            negative && "text-red-600 dark:text-red-400"
          )}
        >
          {value}
        </p>
        {spark && spark.some((v) => v !== 0) && (
          <Sparkline data={spark} width={76} height={26} color={tone} />
        )}
      </div>
      <p className="mt-2.5 truncate text-[12.5px] text-muted-foreground/85">{note}</p>
    </Card>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

/* ------------------------------------------------------------------ */
/*  Cash flow chart                                                    */
/* ------------------------------------------------------------------ */

export interface TrendMonth {
  month: string;
  revenue: number;
  expenses: number;
}

/** Round the axis up to a friendly number so gridlines land on 10k, 20k, … */
function axisTop(maxCents: number) {
  const raw = Math.max(maxCents, 100) / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
  return step * 4;
}

export function shortMoney(cents: number) {
  const dollars = Math.abs(cents) / 100;
  const sign = cents < 0 ? "-" : "";
  if (dollars >= 1_000_000) return `${sign}${+(dollars / 1_000_000).toFixed(1)}m`;
  if (dollars >= 1000) return `${sign}${+(dollars / 1000).toFixed(1)}k`;
  return `${sign}${Math.round(dollars)}`;
}

export function CashFlowChart({ months }: { months: TrendMonth[] }) {
  const top = axisTop(Math.max(...months.flatMap((m) => [m.revenue, m.expenses]), 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const pct = (v: number) => `${Math.max(0, (v / top) * 100)}%`;

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative min-h-[220px] flex-1 pl-10">
        {ticks.map((t) => (
          <div
            key={t}
            className={cn(
              "absolute left-10 right-0 border-t",
              t === 0 ? "border-border" : "border-foreground/[0.05]"
            )}
            style={{ bottom: pct(t) }}
          >
            <span className="absolute -left-10 w-8 -translate-y-1/2 text-right font-mono text-[11px] text-muted-foreground/70">
              {shortMoney(t)}
            </span>
          </div>
        ))}
        <div className="relative flex h-full items-end">
          {months.map((m) => (
            <Tooltip key={m.month}>
              <TooltipTrigger asChild>
                <div className="group flex h-full flex-1 items-end justify-center gap-[3px] rounded-md hover:bg-foreground/[0.025]">
                  <div className="w-2 rounded-t-[3px] sm:w-3" style={{ height: pct(m.revenue), backgroundColor: TONE.moneyIn }} />
                  <div className="w-2 rounded-t-[3px] opacity-70 sm:w-3" style={{ height: pct(m.expenses), backgroundColor: TONE.moneyOut }} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[12px]">
                <p className="font-medium">
                  {new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </p>
                <p>In {formatMoney(m.revenue)} · Out {formatMoney(m.expenses)}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
      <div className="mt-2 flex pl-10">
        {months.map((m, i) => (
          <span
            key={m.month}
            className={cn(
              "flex-1 text-center text-[12px]",
              i === months.length - 1 ? "font-medium text-foreground" : "text-muted-foreground/70"
            )}
          >
            {new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" })}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; faded?: boolean }[] }) {
  return (
    <div className="flex items-center gap-4 text-[12.5px] text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-[2px]", it.faded && "opacity-70")} style={{ backgroundColor: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** A thin horizontal bar split into coloured parts. */
export function SplitBar({ parts }: { parts: { value: number; color: string; label: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return <div className="h-2 rounded-full bg-foreground/[0.06]" />;
  return (
    <div className="flex h-2 gap-[3px]">
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <div
            key={p.label}
            className="h-full rounded-full"
            style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }}
          />
        ))}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-[13px] text-muted-foreground">{children}</p>;
}

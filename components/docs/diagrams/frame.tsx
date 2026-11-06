import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Building blocks every docs diagram shares: a hairline panel, small pills and
// labels, arrows, and the ledger pieces accounting diagrams are made of. Colours
// come from the app's own tokens, so diagrams match dubbl in light and dark.

export function Frame({ children, caption, className }: { children: ReactNode; caption?: string; className?: string }) {
  return (
    <figure className="not-prose my-8">
      <div className={cn("overflow-x-auto rounded-[10px] border border-border bg-card p-5 md:p-6", className)}>{children}</div>
      {caption && <figcaption className="mt-2.5 text-[13px] text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}

export const tone = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  watch: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
  bad: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
  info: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30",
  plain: "bg-muted text-muted-foreground ring-border",
} as const;
export type Tone = keyof typeof tone;

export const fill = {
  good: "bg-emerald-500",
  watch: "bg-amber-400",
  bad: "bg-rose-500",
  info: "bg-sky-500",
  plain: "bg-muted-foreground/30",
} as const;

export function Pill({ children, t = "plain", className }: { children: ReactNode; t?: Tone; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset", tone[t], className)}>{children}</span>;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground", className)}>{children}</div>;
}

/** A right-pointing connector between boxes in a row; turns downward on narrow screens. */
export function Arrow({ label }: { label?: string }) {
  return (
    <div aria-hidden="true" className="flex shrink-0 flex-col items-center justify-center gap-1 text-muted-foreground/60 max-md:py-1">
      <svg width="28" height="14" viewBox="0 0 28 14" fill="none" className="max-md:rotate-90">
        <path d="M0 7h25m0 0-5-5m5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label && <span className="text-[11px] text-muted-foreground">{label}</span>}
    </div>
  );
}

/** A box in a flow: a title and a line of detail. */
export function Box({ title, children, className, active }: { title: ReactNode; children?: ReactNode; className?: string; active?: boolean }) {
  return (
    <div className={cn("rounded-lg border bg-background px-4 py-3", active ? "border-foreground/60" : "border-border", className)}>
      <div className="text-[14px] font-medium text-foreground">{title}</div>
      {children && <div className="mt-1 text-[12.5px] leading-[1.5] text-muted-foreground">{children}</div>}
    </div>
  );
}

/** The summary that opens a Learn page. */
export function ShortVersion({ children }: { children: ReactNode }) {
  return (
    <div className="dd-short not-prose my-6 rounded-[10px] border border-border bg-muted/50 px-5 py-4">
      <Label>The short version</Label>
      <div className="dd-short-body mt-2 text-[15px] leading-[1.65] text-foreground">{children}</div>
    </div>
  );
}

/** Money as the app shows it: from cents, two decimals, tabular digits. */
export function Amount({ cents, currency = "$", className }: { cents: number; currency?: string; className?: string }) {
  const sign = cents < 0 ? "-" : "";
  const value = (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <span className={cn("font-mono tabular-nums", className)}>{`${sign}${currency}${value}`}</span>;
}

export interface JournalLine {
  account: string;
  debit?: number;
  credit?: number;
  note?: string;
}

/** A journal entry as the ledger records it: account, debit, credit (amounts in cents). */
export function JournalEntry({ title, date, lines, caption }: { title?: string; date?: string; lines: JournalLine[]; caption?: string }) {
  const debits = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const credits = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  return (
    <Frame caption={caption} className="p-0 md:p-0">
      {(title || date) && (
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-[13.5px] font-medium text-foreground">{title}</span>
          {date && <span className="font-mono text-[12px] text-muted-foreground">{date}</span>}
        </div>
      )}
      <table className="w-full min-w-[420px] text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            <th className="px-5 py-2 font-medium">Account</th>
            <th className="w-32 px-5 py-2 text-right font-medium">Debit</th>
            <th className="w-32 px-5 py-2 text-right font-medium">Credit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-t border-border/70">
              <td className={cn("px-5 py-2.5 text-foreground", l.credit && !l.debit && "pl-10")}>
                {l.account}
                {l.note && <span className="ml-2 text-[12px] text-muted-foreground">{l.note}</span>}
              </td>
              <td className="px-5 py-2.5 text-right">{l.debit ? <Amount cents={l.debit} /> : null}</td>
              <td className="px-5 py-2.5 text-right">{l.credit ? <Amount cents={l.credit} /> : null}</td>
            </tr>
          ))}
          <tr className="border-t border-border bg-muted/40 text-[12.5px]">
            <td className="px-5 py-2 text-muted-foreground">{debits === credits ? "Balanced" : "Out of balance"}</td>
            <td className="px-5 py-2 text-right font-medium"><Amount cents={debits} /></td>
            <td className="px-5 py-2 text-right font-medium"><Amount cents={credits} /></td>
          </tr>
        </tbody>
      </table>
    </Frame>
  );
}

/** A T-account: debits on the left, credits on the right (amounts in cents). */
export function TAccount({ name, debits = [], credits = [], className }: { name: string; debits?: { label: string; cents: number }[]; credits?: { label: string; cents: number }[]; className?: string }) {
  const rows = Math.max(debits.length, credits.length, 1);
  return (
    <div className={cn("min-w-[220px] flex-1 rounded-lg border border-border bg-background", className)}>
      <div className="border-b-2 border-foreground/70 px-3 py-2 text-center text-[13px] font-medium text-foreground">{name}</div>
      <div className="grid grid-cols-2">
        {[debits, credits].map((side, s) => (
          <div key={s} className={cn("px-3 py-2", s === 0 && "border-r-2 border-foreground/70")}>
            <div className="mb-1 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">{s === 0 ? "Debit" : "Credit"}</div>
            {Array.from({ length: rows }, (_, i) => side[i]).map((e, i) => (
              <div key={i} className="flex h-6 items-center justify-between gap-2 text-[12.5px]">
                <span className="truncate text-muted-foreground">{e?.label}</span>
                {e && <Amount cents={e.cents} className="text-foreground" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Status chips joined by arrows: how a document moves through its life. */
export function Lifecycle({ steps, caption }: { steps: { name: string; t?: Tone; note?: string }[]; caption?: string }) {
  return (
    <Frame caption={caption}>
      <div className="flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch">
        {steps.map((s, i) => (
          <div key={s.name} className="flex items-center gap-2 max-md:flex-col max-md:items-stretch">
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <Pill t={s.t}>{s.name}</Pill>
              {s.note && <div className="mt-1.5 max-w-[180px] text-[12px] leading-[1.45] text-muted-foreground">{s.note}</div>}
            </div>
            {i < steps.length - 1 && <Arrow />}
          </div>
        ))}
      </div>
    </Frame>
  );
}

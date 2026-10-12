import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ExplorerStatus } from "./types";

const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "2026-02-25" → Date at local midnight (no UTC shift). */
export function parseDay(value: string | null | undefined) {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function formatDay(value: string | null | undefined) {
  const date = parseDay(value);
  return date ? DATE_FMT.format(date) : "—";
}

export function toDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Whole days from today to the date: negative is in the past. */
export function daysUntil(value: string | null | undefined) {
  const date = parseDay(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

export function DateCell({ value }: { value: string | null | undefined }) {
  return <span className="tabular-nums text-foreground/80">{formatDay(value)}</span>;
}

/** A due or expiry date with a coloured "in 3 days" / "12 days late" note while it still matters. */
export function DueCell({ value, open, lateWord = "late" }: { value: string | null | undefined; open: boolean; lateWord?: string }) {
  const days = daysUntil(value);
  let note: { text: string; className: string } | null = null;
  if (open && days != null) {
    if (days < 0) {
      const late = -days;
      note = {
        text: `${late}d ${lateWord}`,
        className: late > 60 ? "bg-red-500/12 text-red-700 dark:text-red-400" : "bg-red-500/8 text-red-600 dark:text-red-400",
      };
    } else if (days === 0) note = { text: "Today", className: "bg-amber-500/12 text-amber-700 dark:text-amber-400" };
    else if (days <= 7) note = { text: `in ${days}d`, className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" };
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular-nums text-foreground/80">{formatDay(value)}</span>
      {note && <span className={cn("rounded px-1.5 py-px text-[11px] font-medium tabular-nums", note.className)}>{note.text}</span>}
    </span>
  );
}

export function MoneyCell({ cents, currency, className }: { cents: number | null | undefined; currency?: string | null; className?: string }) {
  if (cents == null) return <span className="text-muted-foreground/50">—</span>;
  return <span className={cn("tabular-nums", cents === 0 && "text-muted-foreground/60", className)}>{formatMoney(cents, currency || "USD")}</span>;
}

export function StatusPill({ value, options }: { value: string; options: ExplorerStatus[] }) {
  const status = options.find((o) => o.value === value);
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-md bg-foreground/[0.045] px-2 text-[12px] font-medium text-foreground/80">
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: status?.color ?? "#A1A1AA" }} />
      {status?.label ?? value}
    </span>
  );
}

const AVATAR_TONES = ["#0EA5E9", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#F97316", "#14B8A6", "#6366F1"];

function tone(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length];
}

export function PartyCell({ name, sub }: { name: string | null | undefined; sub?: string | null }) {
  if (!name) return <span className="text-muted-foreground/50">—</span>;
  const color = tone(name);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold"
        style={{ backgroundColor: `${color}1c`, color }}
      >
        {initials}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{name}</span>
        {sub && <span className="block truncate text-[11.5px] text-muted-foreground">{sub}</span>}
      </span>
    </span>
  );
}

export function NumberCell({ value }: { value: string | null | undefined }) {
  return <span className="font-mono text-[12.5px] text-foreground/90">{value || "—"}</span>;
}

export function MutedCell({ value }: { value: string | null | undefined }) {
  return value ? <span className="truncate text-foreground/80">{value}</span> : <span className="text-muted-foreground/50">—</span>;
}

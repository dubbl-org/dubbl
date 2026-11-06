"use client";

import Link from "next/link";
import { Calendar, ClipboardList, Mail, MessageSquare, Phone, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/lib/query/use-api";

export const ACTIVITY_TYPES: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  note: { label: "Note", icon: MessageSquare, color: "#64748B" },
  email: { label: "Email", icon: Mail, color: "#3B82F6" },
  call: { label: "Call", icon: Phone, color: "#10B981" },
  meeting: { label: "Meeting", icon: Calendar, color: "#8B5CF6" },
  task: { label: "Task", icon: ClipboardList, color: "#F59E0B" },
};

export function ActivityIcon({ type }: { type: string }) {
  const meta = ACTIVITY_TYPES[type] ?? ACTIVITY_TYPES.note;
  const Icon = meta.icon;
  return (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-md"
      style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

export function timeAgo(value: string | null | undefined) {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const future = diff < 0;
  const mins = Math.floor(Math.abs(diff) / 60000);
  const fmt = (n: number, unit: string) => (future ? `in ${n}${unit}` : `${n}${unit} ago`);
  if (mins < 1) return future ? "in a moment" : "just now";
  if (mins < 60) return fmt(mins, "m");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return fmt(hours, "h");
  const days = Math.floor(hours / 24);
  if (days < 30) return fmt(days, "d");
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface PeekActivity {
  id: string;
  type: string;
  content: string | null;
  createdAt: string;
  scheduledAt: string | null;
  completedAt: string | null;
  user: { name: string | null } | null;
}

/** The latest few activities on a deal, for previews. */
export function DealActivityPeek({ dealId }: { dealId: string }) {
  const { data, error } = useApi<{ activities?: PeekActivity[]; totalAll?: number }>(`/api/v1/crm/deals/${dealId}/activities?limit=5`);
  const state = data ? { items: data.activities ?? [], total: data.totalAll ?? 0 } : error ? { items: [] as PeekActivity[], total: 0 } : null;
  const loading = !state;

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12.5px] font-medium text-muted-foreground">Recent activity</p>
        <Link href={`/crm/deals/${dealId}/activity`} className="text-[12.5px] text-muted-foreground hover:text-foreground">
          {state && state.total > 0 ? `All ${state.total}` : "Log activity"}
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-4/5" />
        </div>
      ) : state.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-5 text-center text-[12.5px] text-muted-foreground">
          Nothing logged on this deal yet
        </p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/80">
          {state.items.map((a) => (
            <li key={a.id} className="flex items-start gap-2.5 px-3 py-2.5">
              <ActivityIcon type={a.type} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[13px] leading-snug">{a.content || ACTIVITY_TYPES[a.type]?.label || a.type}</p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {a.user?.name ?? "Someone"} · {timeAgo(a.createdAt)}
                  {a.scheduledAt && !a.completedAt && <> · due {timeAgo(a.scheduledAt)}</>}
                  {a.completedAt && <> · done</>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

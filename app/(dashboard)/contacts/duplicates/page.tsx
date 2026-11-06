"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, EyeOff, Loader2, Merge, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { postJson } from "@/components/dashboard/explorer/action-button";
import { PartyCell, StatusPill, formatDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerStatus } from "@/components/dashboard/explorer/types";
import { useApi } from "@/lib/query/use-api";

type Reason = "name" | "email" | "taxNumber";

interface Member {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: "customer" | "supplier" | "both";
  currencyCode: string | null;
  createdAt: string;
  taxNumberHint: string | null;
  invoiceCount: number;
  billCount: number;
  quoteCount: number;
  paymentCount: number;
  owesYou: number;
  youOwe: number;
}

interface Group {
  key: string;
  reasons: Reason[];
  matched: { reason: Reason; value: string }[];
  suggestedKeepId: string;
  members: Member[];
}

const TYPES: ExplorerStatus[] = [
  { value: "customer", label: "Customer", color: "#0EA5E9" },
  { value: "supplier", label: "Supplier", color: "#14B8A6" },
  { value: "both", label: "Customer & supplier", color: "#8B5CF6" },
];

const REASON: Record<Reason, string> = { name: "Same name", email: "Same email", taxNumber: "Same tax number" };

function records(m: Member) {
  const parts = [
    m.invoiceCount && `${m.invoiceCount} invoice${m.invoiceCount === 1 ? "" : "s"}`,
    m.billCount && `${m.billCount} bill${m.billCount === 1 ? "" : "s"}`,
    m.quoteCount && `${m.quoteCount} quote${m.quoteCount === 1 ? "" : "s"}`,
    m.paymentCount && `${m.paymentCount} payment${m.paymentCount === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No records yet";
}

const dismissKey = () => `dubbl.contacts.duplicates.dismissed.${localStorage.getItem("activeOrgId") ?? ""}`;

function loadDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(dismissKey()) ?? "[]");
  } catch {
    return [];
  }
}

export default function DuplicatesPage() {
  useDocumentTitle("Contacts · Duplicates");
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { data, error: loadError, refetch } = useApi<{ data?: Group[] }>("/api/v1/contacts/duplicates");
  const groups = useMemo(() => (data ? data.data ?? [] : null), [data]);
  const error = loadError && !data ? loadError.message || "Couldn't check for duplicates" : null;
  // Groups marked "not duplicates" are remembered on this device, read once the scan is in.
  const [dismissedState, setDismissed] = useState<string[] | null>(null);
  const dismissed = useMemo(() => dismissedState ?? (groups ? loadDismissed() : []), [dismissedState, groups]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [keep, setKeep] = useState<Record<string, string>>({});

  const rescan = useCallback(() => void refetch(), [refetch]);

  const visible = useMemo(() => (groups ?? []).filter((g) => showDismissed || !dismissed.includes(g.key)), [groups, dismissed, showDismissed]);
  const hiddenCount = (groups ?? []).filter((g) => dismissed.includes(g.key)).length;
  const contactCount = visible.reduce((s, g) => s + g.members.length, 0);

  function toggleDismiss(key: string) {
    const next = dismissed.includes(key) ? dismissed.filter((k) => k !== key) : [...dismissed, key];
    localStorage.setItem(dismissKey(), JSON.stringify(next));
    setDismissed(next);
    if (!dismissed.includes(key)) toast.success("Marked as not duplicates", { description: "We won't suggest this group again." });
  }

  function merge(group: Group) {
    const keepId = keep[group.key] ?? group.suggestedKeepId;
    const survivor = group.members.find((m) => m.id === keepId)!;
    const others = group.members.filter((m) => m.id !== keepId);
    return confirm({
      title: `Merge into "${survivor.name}"?`,
      description: `${others.map((m) => `"${m.name}"`).join(", ")} ${others.length === 1 ? "is" : "are"} folded into "${survivor.name}": every invoice, bill, payment, quote, person and file moves across, then the duplicate${others.length === 1 ? " is" : "s are"} removed. This can't be undone.`,
      confirmLabel: others.length === 1 ? "Merge them" : `Merge ${others.length + 1} contacts`,
      destructive: true,
      onConfirm: async () => {
        try {
          // The route merges the contact in the URL (source) into targetContactId (survivor).
          for (const m of others) await postJson(`/api/v1/contacts/${m.id}/merge`, { targetContactId: survivor.id });
          toast.success(`Merged into ${survivor.name}`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Couldn't merge these contacts");
          throw err;
        }
      },
    });
  }

  return (
    <div className="@container space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Duplicates</h2>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            {groups == null ? (
              "Checking your contacts…"
            ) : visible.length ? (
              <>
                <span className="font-medium text-foreground">{visible.length}</span> group{visible.length === 1 ? "" : "s"} ·{" "}
                <span className="font-medium text-foreground">{contactCount}</span> contacts that look entered more than once
              </>
            ) : (
              "No likely duplicates"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowDismissed((v) => !v)}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors", showDismissed ? "bg-foreground/[0.055] font-medium" : "text-muted-foreground hover:bg-foreground/[0.035] hover:text-foreground")}
            >
              <EyeOff className="size-3.5" />
              {showDismissed ? "Hide" : "Show"} {hiddenCount} dismissed
            </button>
          )}
          <button type="button" onClick={rescan} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 px-3 text-[13px] font-medium hover:bg-foreground/[0.03]">
            <RefreshCw className="size-3.5" />
            Check again
          </button>
        </div>
      </div>

      <p className="max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
        We group contacts with the same name (ignoring capitals, punctuation and words like Inc, LLC or Ltd), the same email address or the same tax number. Pick the one to keep, then merge: everything attached to the others moves onto it.
      </p>

      {error ? (
        <div className="rounded-xl border border-border/80 px-4 py-10 text-center text-[13px] text-muted-foreground">
          {error}{" "}
          <button type="button" onClick={rescan} className="font-medium text-foreground underline-offset-2 hover:underline">
            Try again
          </button>
        </div>
      ) : groups == null ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border/80 p-4">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex min-h-[45vh] flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10">
            <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="mt-4 text-[16px] font-semibold tracking-tight">Your contact list is clean</h3>
          <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            No two contacts share a name, email or tax number{hiddenCount ? `, apart from ${hiddenCount} group${hiddenCount === 1 ? "" : "s"} you marked as different` : ""}.
          </p>
          <Link href="/contacts" className="mt-4 text-[13px] font-medium underline-offset-2 hover:underline">
            Back to all contacts
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((g) => (
            <GroupCard
              key={g.key}
              group={g}
              keepId={keep[g.key] ?? g.suggestedKeepId}
              onKeep={(id) => setKeep((k) => ({ ...k, [g.key]: id }))}
              onMerge={() => merge(g)}
              dismissed={dismissed.includes(g.key)}
              onDismiss={() => toggleDismiss(g.key)}
            />
          ))}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

function GroupCard({
  group,
  keepId,
  onKeep,
  onMerge,
  dismissed,
  onDismiss,
}: {
  group: Group;
  keepId: string;
  onKeep: (id: string) => void;
  onMerge: () => Promise<unknown>;
  dismissed: boolean;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const survivor = group.members.find((m) => m.id === keepId);

  return (
    <section className={cn("overflow-hidden rounded-xl border border-border/80 bg-card", dismissed && "opacity-60")}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {group.matched.map((m) => (
            <span key={`${m.reason}:${m.value}`} className="inline-flex h-[22px] max-w-full items-center gap-1 truncate rounded-md bg-foreground/[0.045] px-2 text-[12px] text-foreground/80">
              <span className="font-medium">{REASON[m.reason]}</span>
              <span className="truncate text-muted-foreground">{m.value}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onDismiss} className="inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-foreground/[0.035] hover:text-foreground">
            {dismissed ? "Suggest again" : "Not duplicates"}
          </button>
          <button
            type="button"
            disabled={busy || dismissed}
            onClick={async () => {
              setBusy(true);
              try {
                await onMerge();
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Merge className="size-3.5" />}
            Merge into {survivor?.name ?? "selected"}
          </button>
        </div>
      </header>
      <div role="radiogroup" aria-label="Contact to keep" className="divide-y divide-border/50">
        {group.members.map((m) => {
          const selected = m.id === keepId;
          return (
            <label
              key={m.id}
              className={cn(
                "grid cursor-pointer grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors @3xl:grid-cols-[20px_minmax(0,1.4fr)_170px_minmax(0,1.2fr)_130px_110px_28px]",
                selected ? "bg-foreground/[0.035]" : "hover:bg-foreground/[0.02]"
              )}
            >
              <input type="radio" name={`keep-${group.key}`} checked={selected} onChange={() => onKeep(m.id)} className="size-3.5 accent-foreground" />
              <span className="min-w-0 text-[13px]">
                <PartyCell name={m.name} sub={[m.email, m.taxNumberHint && `tax no. …${m.taxNumberHint}`].filter(Boolean).join(" · ") || "No email"} />
              </span>
              <span className="justify-self-end @3xl:justify-self-start">
                {selected ? (
                  <span className="rounded bg-foreground/[0.07] px-1.5 py-px text-[11px] font-medium text-foreground/80">Keep this one</span>
                ) : (
                  <StatusPill value={m.type} options={TYPES} />
                )}
              </span>
              <span className="col-start-2 truncate text-[12.5px] text-muted-foreground @3xl:col-start-auto @3xl:text-[13px] @3xl:text-foreground/80">{records(m)}</span>
              <span className="col-start-2 text-[12.5px] tabular-nums text-muted-foreground @3xl:col-start-auto @3xl:text-right @3xl:text-[13px] @3xl:text-foreground/80">
                {m.owesYou > 0 ? `Owes ${formatMoney(m.owesYou, m.currencyCode || "USD")}` : m.youOwe > 0 ? `You owe ${formatMoney(m.youOwe, m.currencyCode || "USD")}` : "Nothing owed"}
              </span>
              <span className="hidden text-[12.5px] tabular-nums text-muted-foreground @3xl:block">Added {formatDay(m.createdAt)}</span>
              <Link
                href={`/contacts/${m.id}`}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Open ${m.name}`}
                className="hidden size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground @3xl:flex"
              >
                <ArrowUpRight className="size-3.5" />
              </Link>
            </label>
          );
        })}
      </div>
    </section>
  );
}

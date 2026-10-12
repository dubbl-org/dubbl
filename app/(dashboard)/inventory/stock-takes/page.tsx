"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Clock, FileText, Plus, CheckCircle2, ArrowRight, Play } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton } from "@/components/dashboard/explorer/action-button";
import { DateCell, MutedCell, PartyCell, StatusPill, daysUntil, formatDay, toDayKey } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface StockTake {
  id: string;
  name: string;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  warehouseId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}

interface StockTakeLine {
  id: string;
  expectedQuantity: number;
  countedQuantity: number | null;
  discrepancy: number | null;
  adjusted: boolean | null;
  valueAdjustment: number | null;
  inventoryItem: { name: string; code: string } | null;
}

const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Not started", color: "#A1A1AA", hint: "Planned, but nobody has started counting" },
  { value: "in_progress", label: "Counting", color: "#0EA5E9", hint: "Someone is counting the shelves right now" },
  { value: "completed", label: "Done", color: "#10B981", hint: "Counted, and stock levels were corrected to match" },
  { value: "cancelled", label: "Cancelled", color: "#D4D4D8", hint: "Stopped before it finished" },
];

/** Timestamps → local day keys so the date filter and chart use the right day. */
const day = (value: string | null | undefined) => (value ? toDayKey(new Date(value)) : null);

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

/** Whole days between starting and finishing a count. */
function daysToFinish(st: StockTake) {
  if (!st.startedAt || !st.completedAt) return null;
  return Math.max(0, Math.round((new Date(st.completedAt).getTime() - new Date(st.startedAt).getTime()) / 86400000));
}

async function patchJson(url: string, body: unknown) {
  const orgId = localStorage.getItem("activeOrgId");
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(orgId ? { "x-organization-id": orgId } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.error === "string" ? data.error : "Something went wrong");
  }
}

function CountLines({ id }: { id: string }) {
  const [state, setState] = useState<{ id: string; lines: StockTakeLine[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const orgId = localStorage.getItem("activeOrgId");
    fetch(`/api/v1/stock-takes/${id}`, { headers: orgId ? { "x-organization-id": orgId } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => !cancelled && setState({ id, lines: json?.stockTake?.lines ?? [] }))
      .catch(() => !cancelled && setState({ id, lines: [] }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const lines = state?.id === id ? state.lines : null;
  if (!lines) {
    return (
      <div className="mt-6 space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    );
  }

  const counted = lines.filter((l) => l.countedQuantity != null).length;
  const off = lines.filter((l) => (l.discrepancy ?? 0) !== 0);
  const valueChange = lines.reduce((s, l) => s + (l.valueAdjustment ?? 0), 0);
  // Show the differences first: that's what someone reviewing a count cares about
  const ordered = [...lines].sort((a, b) => Math.abs(b.discrepancy ?? 0) - Math.abs(a.discrepancy ?? 0));

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[12.5px] font-medium text-muted-foreground">Items on this count</p>
        <p className="text-[12px] tabular-nums text-muted-foreground">
          {counted} of {lines.length} counted · {plural(off.length, "difference")}
          {valueChange !== 0 && ` · ${valueChange > 0 ? "+" : ""}${formatMoney(valueChange)}`}
        </p>
      </div>
      {lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">No items on this count</p>
      ) : (
        <div className="max-h-[420px] overflow-auto rounded-xl border border-border/80">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-card">
              <tr className="h-8 bg-foreground/[0.025] text-[11.5px] text-muted-foreground">
                <th className="px-3 text-left font-medium">Item</th>
                <th className="w-20 px-2 text-right font-medium">Expected</th>
                <th className="w-20 px-2 text-right font-medium">Counted</th>
                <th className="w-20 px-3 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((l) => {
                const d = l.discrepancy ?? (l.countedQuantity != null ? l.countedQuantity - l.expectedQuantity : null);
                return (
                  <tr key={l.id} className="border-t border-border/60">
                    <td className="px-3 py-2">
                      <span className="block truncate">{l.inventoryItem?.name ?? "Unknown item"}</span>
                      {l.inventoryItem?.code && <span className="block font-mono text-[11px] text-muted-foreground">{l.inventoryItem.code}</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{l.expectedQuantity.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{l.countedQuantity != null ? l.countedQuantity.toLocaleString() : <span className="text-muted-foreground/50">—</span>}</td>
                    <td className={cn("px-3 py-2 text-right font-medium tabular-nums", d != null && d < 0 && "text-red-600 dark:text-red-400", d != null && d > 0 && "text-emerald-600 dark:text-emerald-400")}>
                      {d == null ? <span className="font-normal text-muted-foreground/50">—</span> : d === 0 ? <span className="font-normal text-muted-foreground">0</span> : `${d > 0 ? "+" : ""}${d.toLocaleString()}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function StockTakesPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  useDocumentTitle("Inventory · Stock Takes");
  const [version, setVersion] = useState(0);
  const [warehouses, setWarehouses] = useState<Record<string, string>>({});

  // A new stock take from the create drawer reloads the list
  useEffect(() => {
    const handler = () => setVersion((v) => v + 1);
    window.addEventListener("refetch-stock-takes", handler);
    return () => window.removeEventListener("refetch-stock-takes", handler);
  }, []);

  // Location names (the list only carries the id)
  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/warehouses", { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((json: { data?: { id: string; name: string }[] }) => setWarehouses(Object.fromEntries((json.data ?? []).map((w) => [w.id, w.name]))))
      .catch(() => {});
  }, []);

  const config = useMemo<ExplorerConfig<StockTake>>(() => {
    const location = (st: StockTake) => (st.warehouseId ? warehouses[st.warehouseId] ?? null : "All locations");
    return {
      id: "stock-takes",
      endpoint: "/api/v1/stock-takes",
      select: (json) => ((json as { stockTakes?: StockTake[] }).stockTakes ?? []),
      noun: { one: "Stock take", many: "Stock takes" },
      getId: (st) => st.id,
      href: (st) => `/inventory/stock-takes/${st.id}`,
      status: { get: (st) => st.status, options: STATUSES },
      date: { get: (st) => day(st.createdAt), label: "Created" },
      party: { get: location, label: "Location", many: "Locations" },
      search: (st) => [st.name, st.notes, location(st)],
      defaultSort: { key: "created", dir: "desc" },
      columns: [
        { key: "name", label: "Name", value: (st) => st.name, render: (st) => <span className="truncate font-medium">{st.name}</span> },
        { key: "location", label: "Location", className: "w-48", value: location, render: (st) => <PartyCell name={location(st)} /> },
        { key: "status", label: "Status", className: "w-32", value: (st) => st.status, render: (st) => <StatusPill value={st.status} options={STATUSES} /> },
        { key: "items", label: "Items", align: "right", className: "w-20", hint: "How many items are on the count sheet", value: (st) => st.itemCount ?? 0 },
        { key: "created", label: "Created", className: "w-32", value: (st) => st.createdAt, render: (st) => <DateCell value={day(st.createdAt)} /> },
        { key: "started", label: "Started", className: "w-32", value: (st) => st.startedAt, render: (st) => <DateCell value={day(st.startedAt)} /> },
        { key: "completed", label: "Finished", className: "w-32", value: (st) => st.completedAt, render: (st) => <DateCell value={day(st.completedAt)} /> },
        { key: "duration", label: "Days to finish", align: "right", className: "w-28", hidden: true, value: daysToFinish, render: (st) => <span className="tabular-nums">{daysToFinish(st) ?? "—"}</span> },
        { key: "notes", label: "Notes", hidden: true, value: (st) => st.notes, render: (st) => <MutedCell value={st.notes} /> },
        { key: "updated", label: "Last changed", className: "w-32", hidden: true, value: (st) => st.updatedAt, render: (st) => <DateCell value={day(st.updatedAt)} /> },
      ],
      metrics: (rows) => {
        const counting = rows.filter((st) => st.status === "in_progress");
        const drafts = rows.filter((st) => st.status === "draft");
        const done = rows.filter((st) => st.status === "completed");
        const items = rows.reduce((s, st) => s + (st.itemCount || 0), 0);
        const last = done.map((st) => day(st.completedAt)).filter((d): d is string => Boolean(d)).sort().pop();
        const ago = last ? -(daysUntil(last) ?? 0) : null;
        const durations = done.map(daysToFinish).filter((d): d is number => d != null);
        const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
        return [
          { key: "counting", label: "Counting now", color: "#0EA5E9", status: "in_progress", value: counting.length.toString(), note: plural(counting.reduce((s, st) => s + (st.itemCount || 0), 0), "item") + " being counted", hint: "Counts someone has started but not finished." },
          { key: "draft", label: "Not started", color: "#A1A1AA", status: "draft", value: drafts.length.toString(), note: drafts.length ? "planned counts" : "Nothing waiting", hint: "Counts that are set up but nobody has started." },
          { key: "done", label: "Done", color: "#10B981", status: "completed", value: done.length.toString(), note: rows.length ? `${Math.round((done.length / rows.length) * 100)}% of all counts` : "No counts yet", hint: "Finished counts. Stock levels were corrected to what was found." },
          { key: "last", label: "Last finished", color: "#F59E0B", value: ago == null ? "Never" : ago === 0 ? "Today" : `${ago} day${ago === 1 ? "" : "s"} ago`, note: last ? formatDay(last) : "Count your stock to catch mistakes", hint: "When you last finished a count. Most businesses count at least every few months." },
          { key: "items", label: "Items on counts", color: "#8B5CF6", value: items.toLocaleString(), note: rows.length ? `${Math.round(items / rows.length)} per count on average` : "—", hint: "How many item lines are on all these count sheets together." },
          { key: "speed", label: "Time to finish", color: "#14B8A6", value: avg == null ? "—" : avg < 1 ? "Same day" : plural(Math.round(avg), "day"), note: durations.length ? `average over ${plural(durations.length, "count")}` : "Finish a count to see this", hint: "On average, how long it takes from starting a count to finishing it." },
        ];
      },
      preview: (st, helpers) => (
        <DocumentPreview
          number={st.name}
          status={st.status}
          statusOptions={STATUSES}
          party={location(st)}
          facts={[
            { label: "Items", value: (st.itemCount ?? 0).toLocaleString() },
            { label: "Created", value: formatDay(day(st.createdAt)) },
            { label: "Started", value: formatDay(day(st.startedAt)) },
            { label: "Finished", value: formatDay(day(st.completedAt)) },
          ]}
          actions={
            <>
              {st.status === "draft" && (
                <ActionButton
                  primary
                  icon={<Play className="size-3.5" />}
                  success="Stock take started"
                  run={async () => {
                    await patchJson(`/api/v1/stock-takes/${st.id}`, { status: "in_progress" });
                    helpers.refresh();
                  }}
                >
                  Start counting
                </ActionButton>
              )}
              {st.status === "in_progress" && (
                <ActionButton primary icon={<ClipboardList className="size-3.5" />} run={async () => router.push(`/inventory/stock-takes/${st.id}`)}>
                  Continue counting
                </ActionButton>
              )}
            </>
          }
        >
          {st.notes && (
            <div className="mt-5">
              <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{st.notes}</p>
            </div>
          )}
          <CountLines id={st.id} />
        </DocumentPreview>
      ),
      empty: <StockTakesEmpty onCreate={() => openDrawer("stockTake")} />,
    };
  }, [warehouses, openDrawer, router]);

  return <Explorer key={version} config={config} />;
}

function StockTakesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div className="flex items-start pt-12 pb-12">
        <div className="grid w-full gap-10 lg:grid-cols-2 lg:gap-16 items-center">
          {/* Left: text + CTA */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              <ClipboardList className="size-3.5 text-brand-500" />
              Physical Inventory Counts
            </div>
            <h2 className="mt-4 text-lg sm:text-2xl font-semibold tracking-tight">Keep your records accurate</h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-md">
              Stock takes let you physically count items in your warehouse and compare against what the system says. Catch discrepancies before they become
              problems.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Button onClick={onCreate} size="lg" className="bg-brand-600 hover:bg-brand-700">
                <Plus className="mr-2 size-4" />
                New Stock Take
              </Button>
            </div>
            {/* Mini stats */}
            <div className="mt-8 flex gap-4 sm:gap-6 text-center">
              {[
                { label: "Counts", value: "0" },
                { label: "Items Counted", value: "0" },
                { label: "Completed", value: "0" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xl font-bold font-mono tabular-nums truncate text-muted-foreground/40">{value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: visual flow of a stock take lifecycle */}
          <div className="relative hidden lg:block">
            <div className="space-y-3">
              {/* Step 1: Draft */}
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-7 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800">
                      <FileText className="size-3.5 text-zinc-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Q1 2026 Full Count</p>
                      <p className="text-[11px] text-muted-foreground font-mono">Draft</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                    Draft
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-muted" />
                  <div className="h-1.5 flex-1 rounded-full bg-muted" />
                  <div className="h-1.5 flex-1 rounded-full bg-muted" />
                </div>
              </div>

              <div className="flex justify-center">
                <ArrowRight className="size-4 text-muted-foreground/30 rotate-90" />
              </div>

              {/* Step 2: In progress */}
              <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                      <Clock className="size-3.5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Counting items...</p>
                      <p className="text-[11px] text-muted-foreground">12 of 48 items counted</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400">
                    In Progress
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-blue-500" />
                  <div className="h-1.5 flex-[3] rounded-full bg-muted" />
                </div>
              </div>

              <div className="flex justify-center">
                <ArrowRight className="size-4 text-muted-foreground/30 rotate-90" />
              </div>

              {/* Step 3: Completed */}
              <div className="rounded-xl border border-dashed border-brand-200 dark:border-brand-900/40 bg-card/60 p-4 opacity-60">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-7 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-950/40">
                      <CheckCircle2 className="size-3.5 text-brand-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Count complete</p>
                      <p className="text-[11px] text-muted-foreground">3 discrepancies found</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-brand-200 bg-brand-50 text-brand-600 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-400">
                    Completed
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-brand-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ContentReveal>
  );
}

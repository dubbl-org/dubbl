"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowRight, BarChart3, Handshake, List, Loader2, Plus, Search, ThumbsDown, Trophy, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useRecords } from "@/components/dashboard/explorer/use-records";
import { daysUntil, formatDay } from "@/components/dashboard/explorer/cells";
import { postJson } from "@/components/dashboard/explorer/action-button";
import { DEFAULT_STAGES, openStages, usePipelines, type Pipeline, type PipelineStage } from "@/components/dashboard/crm/pipelines";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ErrorState } from "@/components/dashboard/error-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Deal {
  id: string;
  title: string;
  pipelineId: string;
  stageId: string;
  valueCents: number;
  currency: string;
  probability: number | null;
  expectedCloseDate: string | null;
  contact: { name: string } | null;
  assignedUser: { name: string | null; email: string } | null;
}

const PIPELINE_KEY = "dubbl.crm.pipeline";
const weighted = (d: Deal) => Math.round((d.valueCents * (d.probability ?? 0)) / 100);

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function CRMPipelinePage() {
  const { pipelines, loading: pipelinesLoading, reload: reloadPipelines } = usePipelines();
  const [chosen, setChosen] = useState<string | null>(() => (typeof window === "undefined" ? null : localStorage.getItem(PIPELINE_KEY)));
  useDocumentTitle("CRM · Pipeline");

  const pipeline = pipelines.find((p) => p.id === chosen) ?? pipelines.find((p) => p.isDefault) ?? pipelines[0] ?? null;

  if (pipelinesLoading) return <BrandLoader />;
  if (!pipeline) return <PipelineSetup onCreated={reloadPipelines} />;

  return (
    <Board
      key={pipeline.id}
      pipeline={pipeline}
      pipelines={pipelines}
      onPick={(id) => {
        setChosen(id);
        localStorage.setItem(PIPELINE_KEY, id);
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Board                                                              */
/* ------------------------------------------------------------------ */

function Board({ pipeline, pipelines, onPick }: { pipeline: Pipeline; pipelines: Pipeline[]; onPick: (id: string) => void }) {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [refreshKey, setRefreshKey] = useState(0);
  const params = useMemo(() => ({ pipelineId: pipeline.id, status: "active", sortBy: "value", sortOrder: "desc" }), [pipeline.id]);
  const { rows, loading, error, refresh } = useRecords<Deal>("/api/v1/crm/deals", params, undefined, refreshKey);

  // Optimistic moves while the server catches up
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [losing, setLosing] = useState<Deal | null>(null);
  const [search, setSearch] = useState("");
  const [outcomes, setOutcomes] = useState<{ won: number; wonValue: number; lost: number } | null>(null);

  useEffect(() => {
    const bump = () => setRefreshKey((k) => k + 1);
    window.addEventListener("deals-changed", bump);
    return () => window.removeEventListener("deals-changed", bump);
  }, []);

  // Won and lost totals for the outcome columns
  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    const headers = { "x-organization-id": orgId };
    Promise.all([
      fetch(`/api/v1/crm/deals?pipelineId=${pipeline.id}&status=won&limit=1`, { headers }).then((r) => r.json()),
      fetch(`/api/v1/crm/deals?pipelineId=${pipeline.id}&status=lost&limit=1`, { headers }).then((r) => r.json()),
    ])
      .then(([won, lost]) => {
        if (cancelled) return;
        setOutcomes({ won: won.summary?.wonCount ?? 0, wonValue: won.summary?.wonValue ?? 0, lost: lost.pagination?.total ?? 0 });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pipeline.id, refreshKey, closed]);

  const stages = openStages(pipeline);
  const q = search.trim().toLowerCase();
  const deals = rows
    .filter((d) => !closed.has(d.id))
    .map((d) => (moved[d.id] ? { ...d, stageId: moved[d.id] } : d))
    .filter((d) => !q || [d.title, d.contact?.name, d.assignedUser?.name].some((v) => v?.toLowerCase().includes(q)));
  // Deals whose stage was removed from the pipeline still need a home: show them in the first column
  const known = new Set(stages.map((s) => s.id));
  const byStage = new Map<string, Deal[]>(stages.map((s) => [s.id, []]));
  for (const d of deals) byStage.get(known.has(d.stageId) ? d.stageId : stages[0]?.id)?.push(d);

  const openValue = deals.reduce((s, d) => s + d.valueCents, 0);
  const forecast = deals.reduce((s, d) => s + weighted(d), 0);
  const active = activeId ? deals.find((d) => d.id === activeId) ?? null : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const markWon = useCallback(
    async (deal: Deal) => {
      setClosed((prev) => new Set(prev).add(deal.id));
      try {
        await postJson(`/api/v1/crm/deals/${deal.id}/won`);
        toast.success(`${deal.title} marked as won`);
      } catch (err) {
        setClosed((prev) => {
          const next = new Set(prev);
          next.delete(deal.id);
          return next;
        });
        toast.error(err instanceof Error ? err.message : "Couldn't mark the deal as won");
      }
    },
    []
  );

  async function moveTo(deal: Deal, stageId: string) {
    if (deal.stageId === stageId) return;
    setMoved((prev) => ({ ...prev, [deal.id]: stageId }));
    const orgId = localStorage.getItem("activeOrgId");
    try {
      const res = await fetch(`/api/v1/crm/deals/${deal.id}/stage`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...(orgId ? { "x-organization-id": orgId } : {}) },
        body: JSON.stringify({ stageId }),
      });
      if (!res.ok) throw new Error("Couldn't move the deal");
    } catch (err) {
      setMoved((prev) => {
        const next = { ...prev };
        delete next[deal.id];
        return next;
      });
      toast.error(err instanceof Error ? err.message : "Couldn't move the deal");
    }
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const deal = deals.find((d) => d.id === e.active.id);
    const target = e.over?.id ? String(e.over.id) : null;
    if (!deal || !target) return;
    if (target === "outcome:won") void markWon(deal);
    else if (target === "outcome:lost") setLosing(deal);
    else void moveTo(deal, target);
  }

  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="@container space-y-4">
      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Pipeline</h2>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{deals.length}</span> open deal{deals.length === 1 ? "" : "s"} worth{" "}
            <span className="font-medium text-foreground tabular-nums">{formatMoney(openValue)}</span>
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            <span title="Each deal counted at its chance of closing">
              weighted <span className="font-medium text-foreground tabular-nums">{formatMoney(forecast)}</span>
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pipelines.length > 1 && (
            <div className="flex h-8 items-center gap-0.5 rounded-lg bg-foreground/[0.035] p-0.5">
              {pipelines.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p.id)}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-[12.5px] font-medium transition-colors",
                    p.id === pipeline.id ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSearch("")}
              placeholder="Filter deals…"
              className="h-8 w-48 rounded-lg bg-foreground/[0.04] pl-8 pr-7 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:bg-background focus:ring-1 focus:ring-border"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear filter" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Link
            href="/crm/deals"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 px-3 text-[13px] font-medium transition-colors hover:bg-foreground/[0.03]"
          >
            <List className="size-3.5" />
            List
          </Link>
          <button
            type="button"
            onClick={() => openDrawer("deal", { pipelineId: pipeline.id })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
          >
            <Plus className="size-3.5" />
            New deal
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {stages.map((s) => (
            <div key={s.id} className="h-[420px] w-[272px] shrink-0 animate-pulse rounded-xl bg-foreground/[0.025]" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
            {stages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                deals={byStage.get(stage.id) ?? []}
                onAdd={() => openDrawer("deal", { pipelineId: pipeline.id, stageId: stage.id })}
                onOpen={(d) => router.push(`/crm/deals/${d.id}`)}
              />
            ))}
            <div className="flex w-[200px] shrink-0 flex-col gap-3">
              <OutcomeZone
                id="outcome:won"
                label="Won"
                icon={Trophy}
                color="#10B981"
                dragging={activeId != null}
                summary={outcomes ? `${outcomes.won} won · ${formatMoney(outcomes.wonValue)}` : "…"}
              />
              <OutcomeZone
                id="outcome:lost"
                label="Lost"
                icon={ThumbsDown}
                color="#EF4444"
                dragging={activeId != null}
                summary={outcomes ? `${outcomes.lost} lost` : "…"}
              />
              <p className="px-1 text-[11.5px] leading-relaxed text-muted-foreground">
                Drag a card here to close it. Closed deals live in the{" "}
                <Link href="/crm/deals" className="underline-offset-2 hover:text-foreground hover:underline">deals list</Link>.
              </p>
            </div>
          </div>
          <DragOverlay dropAnimation={null}>{active && <DealCard deal={active} overlay />}</DragOverlay>
        </DndContext>
      )}

      <LostDialog
        deal={losing}
        onClose={() => setLosing(null)}
        onLost={(deal) => {
          setClosed((prev) => new Set(prev).add(deal.id));
          setLosing(null);
        }}
      />
    </div>
  );
}

function StageColumn({ stage, deals, onAdd, onOpen }: { stage: PipelineStage; deals: Deal[]; onAdd: () => void; onOpen: (d: Deal) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const value = deals.reduce((s, d) => s + d.valueCents, 0);
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex max-h-[calc(100vh-15rem)] min-h-[320px] w-[272px] shrink-0 flex-col rounded-xl border border-border/80 bg-foreground/[0.015] transition-colors",
        isOver && "bg-foreground/[0.055]"
      )}
    >
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
        <span className="truncate text-[13px] font-medium">{stage.name}</span>
        <span className="text-[12px] tabular-nums text-muted-foreground">{deals.length}</span>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add a deal to ${stage.name}`}
          className="ml-auto flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <p className="px-3 pb-2 text-[12px] tabular-nums text-muted-foreground">{formatMoney(value)}</p>
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {deals.map((d) => (
          <DraggableDeal key={d.id} deal={d} onOpen={() => onOpen(d)} />
        ))}
        {deals.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border/80 text-[12px] text-muted-foreground/70">
            No deals here
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableDeal({ deal, onOpen }: { deal: Deal; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onOpen} className={cn("touch-none", isDragging && "opacity-30")}>
      <DealCard deal={deal} />
    </div>
  );
}

function DealCard({ deal, overlay }: { deal: Deal; overlay?: boolean }) {
  const days = daysUntil(deal.expectedCloseDate);
  const owner = deal.assignedUser?.name ?? deal.assignedUser?.email ?? null;
  return (
    <div
      className={cn(
        "cursor-grab rounded-lg border border-border/80 bg-card px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.02] active:cursor-grabbing",
        overlay && "rotate-[1.5deg] shadow-lg"
      )}
    >
      <p className="line-clamp-2 text-[13px] font-medium leading-snug">{deal.title}</p>
      {deal.contact?.name && <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{deal.contact.name}</p>}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[13px] font-semibold tabular-nums">{formatMoney(deal.valueCents, deal.currency)}</span>
        {deal.probability != null && <span className="text-[11.5px] tabular-nums text-muted-foreground">{deal.probability}%</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {deal.expectedCloseDate && (
            <span
              title={`Expected to close ${formatDay(deal.expectedCloseDate)}`}
              className={cn(
                "rounded px-1.5 py-px text-[11px] tabular-nums",
                days != null && days < 0 ? "bg-red-500/10 text-red-600 dark:text-red-400" : days != null && days <= 7 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "text-muted-foreground"
              )}
            >
              {days != null && days < 0 ? `${-days}d late` : formatDay(deal.expectedCloseDate).replace(/, \d{4}$/, "")}
            </span>
          )}
          {owner && (
            <span title={owner} className="flex size-5 items-center justify-center rounded-full bg-foreground/[0.07] text-[9.5px] font-semibold text-foreground/70">
              {initials(owner)}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function OutcomeZone({ id, label, icon: Icon, color, summary, dragging }: { id: string; label: string; icon: typeof Trophy; color: string; summary: string; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-[96px] flex-col justify-center rounded-xl border border-dashed px-3 transition-colors",
        dragging ? "border-border" : "border-border/60",
        isOver && "bg-foreground/[0.055]"
      )}
      style={isOver ? { borderColor: color } : undefined}
    >
      <span className="flex items-center gap-2 text-[13px] font-medium">
        <Icon className="size-3.5" style={{ color }} />
        {label}
      </span>
      <span className="mt-1 text-[12px] tabular-nums text-muted-foreground">{dragging ? `Drop to mark as ${label.toLowerCase()}` : summary}</span>
    </div>
  );
}

function LostDialog({ deal, onClose, onLost }: { deal: Deal | null; onClose: () => void; onLost: (deal: Deal) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!deal) return;
    setBusy(true);
    try {
      await postJson(`/api/v1/crm/deals/${deal.id}/lost`, { reason: reason.trim() || null });
      toast.success(`${deal.title} marked as lost`);
      setReason("");
      onLost(deal);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't mark the deal as lost");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={deal != null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark &ldquo;{deal?.title}&rdquo; as lost?</DialogTitle>
          <DialogDescription>Saying why is optional, but it shows up in your analytics so you can spot patterns.</DialogDescription>
        </DialogHeader>
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. Went with a cheaper supplier"
          className="h-9 w-full rounded-lg bg-foreground/[0.04] px-3 text-[13.5px] outline-none placeholder:text-muted-foreground/70 focus:bg-background focus:ring-1 focus:ring-border"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Keep it open</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Mark lost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  First run                                                          */
/* ------------------------------------------------------------------ */

function PipelineSetup({ onCreated }: { onCreated: () => void }) {
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      await postJson("/api/v1/crm/pipelines", { name: "Sales pipeline", stages: DEFAULT_STAGES, isDefault: true });
      toast.success("Pipeline created");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't set up the pipeline");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Pipeline</h2>
          <p className="mt-1 max-w-lg text-[13.5px] text-muted-foreground">
            Track every sale from first chat to signed deal. Each deal sits in a stage; drag it along as it moves, and mark it won or lost when it&apos;s decided.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/crm/pipelines" className="inline-flex h-8 items-center rounded-lg border border-border/80 px-3 text-[13px] font-medium hover:bg-foreground/[0.03]">
            Design my own stages
          </Link>
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Use the standard stages
          </button>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {DEFAULT_STAGES.filter((s) => !s.id.startsWith("closed_")).map((stage, i) => (
          <div key={stage.id} className="w-[220px] shrink-0 rounded-xl border border-border/80 bg-foreground/[0.015] p-3">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ backgroundColor: stage.color }} />
              <span className="text-[13px] font-medium">{stage.name}</span>
              {i < 3 && <ArrowRight className="ml-auto size-3.5 text-muted-foreground/40" />}
            </div>
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 - Math.min(i, 2) }, (_, n) => (
                <div key={n} className="rounded-lg border border-border/70 bg-card px-3 py-2.5">
                  <div className="h-2 w-28 rounded bg-foreground/[0.07]" />
                  <div className="mt-2 h-2 w-16 rounded bg-foreground/[0.05]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-px overflow-hidden rounded-xl border border-border/80 bg-border/60 sm:grid-cols-3">
        {[
          { icon: Handshake, title: "Every deal in one place", desc: "Value, chance of closing, owner and expected close date on each card." },
          { icon: Users, title: "Log the conversation", desc: "Calls, emails, meetings and follow-up tasks on each deal, plus one feed for all of them." },
          { icon: BarChart3, title: "See what's working", desc: "Win rate, weighted forecast and where deals get stuck." },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="bg-card px-4 py-3.5">
            <span className="flex items-center gap-2 text-[13px] font-medium">
              <Icon className="size-3.5 text-muted-foreground" />
              {title}
            </span>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

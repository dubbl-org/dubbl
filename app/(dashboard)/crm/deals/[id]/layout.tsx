"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  Activity,
  Settings2,
  Trophy,
  XCircle,
  User,
  Target,
  Briefcase,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WON_STAGE, LOST_STAGE } from "@/lib/crm/rules";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { formatMoney } from "@/lib/money";
import { useApi, useApiCache } from "@/lib/query/use-api";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared interfaces
// ---------------------------------------------------------------------------

export interface DealDetail {
  id: string;
  title: string;
  stageId: string;
  valueCents: number;
  currency: string;
  probability: number | null;
  expectedCloseDate: string | null;
  source: string | null;
  notes: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  createdAt: string;
  contact: { id: string; name: string; email: string | null } | null;
  assignedUser: { id: string; name: string | null } | null;
  pipelineId: string;
  assignedTo: string | null;
  contactId: string | null;
  pipeline: { name: string; stages: { id: string; name: string; color: string }[] } | null;
  // Newest first.
  activities: {
    id: string;
    type: string;
    content: string | null;
    createdAt: string;
    scheduledAt: string | null;
    completedAt: string | null;
    user: { name: string | null; email?: string } | null;
  }[];
}

export const SOURCE_LABELS: Record<string, string> = {
  website: "Website",
  referral: "Referral",
  cold_outreach: "Cold Outreach",
  event: "Event",
  other: "Other",
};

export function getHeaders() {
  const orgId = localStorage.getItem("activeOrgId") || "";
  return { "x-organization-id": orgId, "Content-Type": "application/json" };
}

/** Call a CRM API route; throws the API's own error message when it fails. */
export async function crmFetch<T = Record<string, unknown>>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: getHeaders(),
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

export function errorText(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = [
  { value: "overview", label: "Overview", icon: FileText },
  { value: "activity", label: "Activity", icon: Activity },
  { value: "settings", label: "Settings", icon: Settings2 },
] as const;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface DealContextValue {
  deal: DealDetail;
  setDeal: React.Dispatch<React.SetStateAction<DealDetail | null>>;
  fetchDeal: () => Promise<void>;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  confirmDialog: ReturnType<typeof useConfirm>["dialog"];
  stageChanging: boolean;
  changeStage: (stageId: string) => Promise<void>;
  markWon: () => Promise<void>;
  markLost: () => Promise<void>;
  reopen: () => Promise<void>;
  addActivity: () => Promise<void>;
  activityType: string;
  setActivityType: (v: string) => void;
  activityContent: string;
  setActivityContent: (v: string) => void;
  /** Local date-time ("YYYY-MM-DDTHH:mm") the activity is planned for, or "" for something already done. */
  activityScheduledAt: string;
  setActivityScheduledAt: (v: string) => void;
  submitting: boolean;
  saving: boolean;
  setSaving: (v: boolean) => void;
}

const DealContext = createContext<DealContextValue | null>(null);

export function useDealContext() {
  const ctx = useContext(DealContext);
  if (!ctx) throw new Error("useDealContext must be used within DealDetailLayout");
  return ctx;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function DealDetailLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const dealUrl = `/api/v1/crm/deals/${id}`;
  const { data, loading, refetch } = useApi<{ deal?: DealDetail }>(dealUrl);
  const deal = data?.deal ?? null;
  const cache = useApiCache();
  const [stageChanging, setStageChanging] = useState(false);
  const [activityType, setActivityType] = useState("note");
  const [activityContent, setActivityContent] = useState("");
  const [activityScheduledAt, setActivityScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // "Mark lost" asks why (optional); the reason shows up in CRM analytics.
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [lostSaving, setLostSaving] = useState(false);
  const [saving, setSaving] = useState(false);

  useEntityTitle(deal?.title ?? undefined);

  // Waits for the fresh deal (the cache refreshes on its own after any change)
  const fetchDeal = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Edit the cached deal in place
  const setDeal = useCallback<React.Dispatch<React.SetStateAction<DealDetail | null>>>(
    (action) =>
      cache.update<{ deal?: DealDetail }>(dealUrl, (d) => {
        const next = typeof action === "function" ? action(d.deal ?? null) : action;
        return { ...d, deal: next ?? undefined };
      }),
    [cache, dealUrl]
  );

  // Moving to the Won or Lost stage closes the deal; Lost asks for a reason first.
  async function changeStage(stageId: string) {
    if (stageId === LOST_STAGE) {
      await markLost();
      return;
    }
    setStageChanging(true);
    try {
      await crmFetch(`/api/v1/crm/deals/${id}/stage`, { method: "PATCH", body: { stageId } });
      await fetchDeal();
      toast.success(stageId === WON_STAGE ? "Deal marked as won" : "Stage updated");
    } catch (err) {
      toast.error(errorText(err, "Failed to update stage"));
    } finally {
      setStageChanging(false);
    }
  }

  async function markWon() {
    setStageChanging(true);
    try {
      await crmFetch(`/api/v1/crm/deals/${id}/won`, { method: "POST" });
      await fetchDeal();
      toast.success("Deal marked as won");
    } catch (err) {
      toast.error(errorText(err, "Failed to mark the deal as won"));
    } finally {
      setStageChanging(false);
    }
  }

  async function markLost() {
    setLostReason("");
    setLostOpen(true);
  }

  async function submitLost() {
    setLostSaving(true);
    try {
      await crmFetch(`/api/v1/crm/deals/${id}/lost`, { method: "POST", body: { reason: lostReason.trim() || null } });
      await fetchDeal();
      setLostOpen(false);
      toast.success("Deal marked as lost");
    } catch (err) {
      toast.error(errorText(err, "Failed to mark the deal as lost"));
    } finally {
      setLostSaving(false);
    }
  }

  // Back to the first open stage of its pipeline.
  async function reopen() {
    const first = (deal?.pipeline?.stages ?? []).find((s) => s.id !== WON_STAGE && s.id !== LOST_STAGE);
    if (!first) return;
    await changeStage(first.id);
  }

  async function addActivity() {
    if (!activityContent.trim()) return;
    setSubmitting(true);
    try {
      await crmFetch(`/api/v1/crm/deals/${id}/activities`, {
        method: "POST",
        body: {
          type: activityType,
          content: activityContent,
          // datetime-local is local time; send it as an ISO instant.
          scheduledAt: activityScheduledAt ? new Date(activityScheduledAt).toISOString() : null,
        },
      });
      setActivityContent("");
      setActivityScheduledAt("");
      toast.success(activityScheduledAt ? "Activity scheduled" : "Activity added");
    } catch (err) {
      toast.error(errorText(err, "Failed to add activity"));
    } finally {
      setSubmitting(false);
    }
  }

  const activeTab = pathname.endsWith("/activity") ? "activity"
    : pathname.endsWith("/settings") ? "settings"
    : "overview";

  if (loading) return <BrandLoader />;

  if (!deal) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Deal not found</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/crm")}>
          Back to Pipeline
        </Button>
      </div>
    );
  }

  const stages = deal.pipeline?.stages || [];
  const currentStageIdx = stages.findIndex((s) => s.id === deal.stageId);
  const isWon = !!deal.wonAt;
  const isLost = !!deal.lostAt;
  const isClosed = isWon || isLost;

  return (
    <DealContext.Provider
      value={{
        deal,
        setDeal,
        fetchDeal,
        confirm,
        confirmDialog,
        stageChanging,
        changeStage,
        markWon,
        markLost,
        reopen,
        addActivity,
        activityType,
        setActivityType,
        activityContent,
        setActivityContent,
        activityScheduledAt,
        setActivityScheduledAt,
        submitting,
        saving,
        setSaving,
      }}
    >
      <div>
        {/* Back button */}
        <button
          onClick={() => router.push("/crm")}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="size-3.5" />
          Back to pipeline
        </button>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-2">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight truncate">{deal.title}</h1>
              {isWon && (
                <Badge className="bg-brand-100 text-brand-700 border-0 dark:bg-brand-900/60 dark:text-brand-400 shrink-0">
                  <Trophy className="size-3 mr-1" /> Won
                </Badge>
              )}
              {isLost && (
                <Badge className="bg-red-100 text-red-700 border-0 dark:bg-red-900/60 dark:text-red-400 shrink-0">
                  <XCircle className="size-3 mr-1" /> Lost
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="font-mono font-semibold tabular-nums text-foreground text-base">
                {formatMoney(deal.valueCents, deal.currency)}
              </span>
              {deal.probability !== null && (
                <span className="flex items-center gap-1">
                  <Target className="size-3" />
                  {deal.probability}%
                </span>
              )}
              {deal.contact && (
                <span className="flex items-center gap-1">
                  <User className="size-3" />
                  {deal.contact.name}
                </span>
              )}
              {deal.pipeline && (
                <span className="flex items-center gap-1">
                  <Briefcase className="size-3" />
                  {deal.pipeline.name}
                </span>
              )}
            </div>
          </div>

          {!isClosed ? (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30" onClick={markLost} disabled={stageChanging}>
                <XCircle className="size-3" /> Mark Lost
              </Button>
              <Button size="sm" className="h-8 text-xs gap-1.5 bg-brand-600 hover:bg-brand-700" onClick={markWon} disabled={stageChanging}>
                <Trophy className="size-3" /> Mark Won
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={reopen} disabled={stageChanging}>
                <RotateCcw className="size-3" /> Reopen
              </Button>
            </div>
          )}
        </div>

        {/* Stage progress bar */}
        {stages.length > 0 && (
          <div className="mb-6 mt-4">
            <div className="flex items-center gap-1.5">
              {stages.filter((s) => s.id !== "closed_lost").map((stage) => {
                const stageIdx = stages.findIndex((s) => s.id === stage.id);
                const isCurrent = stage.id === deal.stageId;
                const isPast = stageIdx < currentStageIdx;
                const isActive = isCurrent || isPast || isWon;

                return (
                  <button
                    key={stage.id}
                    disabled={isClosed || stageChanging}
                    onClick={() => !isClosed && changeStage(stage.id)}
                    className={cn(
                      "relative flex-1 rounded-full transition-all",
                      isCurrent ? "h-3.5" : "h-2",
                      !isActive && "opacity-15",
                      !isClosed && "hover:opacity-90 cursor-pointer",
                      isClosed && "cursor-default"
                    )}
                    style={{
                      backgroundColor: stage.color,
                      ...(isCurrent
                        ? { boxShadow: `0 0 0 3px var(--background), 0 0 0 5px ${stage.color}, 0 0 12px ${stage.color}60` }
                        : {}),
                    }}
                    title={stage.name}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 mt-2.5">
              {stages.filter((s) => s.id !== "closed_lost").map((stage) => {
                const stageIdx = stages.findIndex((s) => s.id === stage.id);
                const isCurrent = stage.id === deal.stageId;
                const isPast = stageIdx < currentStageIdx;
                const isActive = isCurrent || isPast || isWon;
                return (
                  <div key={stage.id} className="flex-1 text-center">
                    <span
                      className={cn(
                        "text-[10px] leading-none",
                        isCurrent
                          ? "font-bold"
                          : isActive
                            ? "font-medium text-muted-foreground"
                            : "font-medium text-muted-foreground/40"
                      )}
                      style={isCurrent ? { color: stage.color } : undefined}
                    >
                      {stage.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="h-px bg-gradient-to-r from-brand-500/20 via-border to-transparent mb-2" />

        {/* Tabs */}
        <nav className="-mt-0 mb-8 flex items-center gap-1 overflow-x-auto border-b border-border">
          {TABS.map((t) => {
            const Icon = t.icon;
            const tabHref = t.value === "overview"
              ? `/crm/deals/${id}`
              : `/crm/deals/${id}/${t.value}`;
            const active = activeTab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => router.push(tabHref)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2.5 pt-3 text-[13px] font-medium transition-colors",
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <ContentReveal key={pathname}>
          {children}
        </ContentReveal>

        {confirmDialog}

        <Dialog open={lostOpen} onOpenChange={(v) => { if (!lostSaving) setLostOpen(v); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Mark &ldquo;{deal.title}&rdquo; as lost?</DialogTitle>
              <DialogDescription>
                Saying why is optional, but it shows up in your analytics so you can spot patterns.
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitLost(); }}
              placeholder="e.g. Went with a cheaper supplier"
            />
            <DialogFooter className="gap-3">
              <Button variant="outline" disabled={lostSaving} onClick={() => setLostOpen(false)}>Keep it open</Button>
              <Button variant="destructive" loading={lostSaving} onClick={submitLost}>Mark lost</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DealContext.Provider>
  );
}

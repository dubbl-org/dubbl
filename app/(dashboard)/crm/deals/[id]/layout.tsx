"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  Activity,
  Settings2,
  Trophy,
  XCircle,
  Check,
  User,
  DollarSign,
  Target,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { formatMoney } from "@/lib/money";
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
  pipeline: { name: string; stages: { id: string; name: string; color: string }[] } | null;
  activities: {
    id: string;
    type: string;
    content: string | null;
    createdAt: string;
    user: { name: string | null } | null;
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
  addActivity: () => Promise<void>;
  activityType: string;
  setActivityType: (v: string) => void;
  activityContent: string;
  setActivityContent: (v: string) => void;
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

  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageChanging, setStageChanging] = useState(false);
  const [activityType, setActivityType] = useState("note");
  const [activityContent, setActivityContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEntityTitle(deal?.title ?? undefined);

  const fetchDeal = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/crm/deals/${id}`, { headers: getHeaders() });
      const data = await res.json();
      if (data.deal) setDeal(data.deal);
    } catch {
      toast.error("Failed to load deal");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDeal();
  }, [fetchDeal]);

  async function changeStage(stageId: string) {
    setStageChanging(true);
    try {
      await fetch(`/api/v1/crm/deals/${id}/stage`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ stageId }),
      });
      await fetchDeal();
      toast.success("Stage updated");
    } catch {
      toast.error("Failed to update stage");
    } finally {
      setStageChanging(false);
    }
  }

  async function markWon() {
    await fetch(`/api/v1/crm/deals/${id}/won`, { method: "POST", headers: getHeaders() });
    await fetchDeal();
    toast.success("Deal marked as won");
  }

  async function markLost() {
    await confirm({
      title: "Mark deal as lost?",
      description: "This deal will be moved to the closed lost stage.",
      confirmLabel: "Mark Lost",
      destructive: true,
      onConfirm: async () => {
        await fetch(`/api/v1/crm/deals/${id}/lost`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ reason: null }),
        });
        await fetchDeal();
        toast.success("Deal marked as lost");
      },
    });
  }

  async function addActivity() {
    if (!activityContent.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/v1/crm/deals/${id}/activities`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ type: activityType, content: activityContent }),
      });
      setActivityContent("");
      toast.success("Activity added");
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
        addActivity,
        activityType,
        setActivityType,
        activityContent,
        setActivityContent,
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
                <Badge className="bg-emerald-100 text-emerald-700 border-0 dark:bg-emerald-900/60 dark:text-emerald-400 shrink-0">
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

          {!isClosed && (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30" onClick={markLost}>
                <XCircle className="size-3" /> Mark Lost
              </Button>
              <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={markWon}>
                <Trophy className="size-3" /> Mark Won
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

        <div className="h-px bg-gradient-to-r from-emerald-500/20 via-border to-transparent mb-2" />

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
      </div>
    </DealContext.Provider>
  );
}

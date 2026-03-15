"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { motion } from "motion/react";
import {
  Users,
  Handshake,
  BarChart3,
  ArrowRight,
  Plus,
  DollarSign,
  ArrowUpDown,
  Calendar,
  User,
  Loader2,
  Filter,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ErrorState } from "@/components/dashboard/error-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { ContentReveal } from "@/components/ui/content-reveal";
import { SearchInput } from "@/components/ui/search-input";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { formatMoney } from "@/lib/money";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Deal {
  id: string;
  title: string;
  stageId: string;
  valueCents: number;
  currency: string;
  probability: number | null;
  contact: { name: string } | null;
  assignedUser: { name: string } | null;
  expectedCloseDate: string | null;
  source: string | null;
  createdAt: string;
  wonAt: string | null;
  lostAt: string | null;
}

interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string; color: string }[];
  isDefault: boolean;
}

interface Summary {
  activeCount: number;
  activeValue: number;
  wonCount: number;
  wonValue: number;
  totalDeals: number;
  stageDistribution: Record<string, { count: number; value: number }>;
}

type SortKey = "value" | "name" | "date" | "probability";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "value", label: "Value" },
  { value: "name", label: "Name" },
  { value: "date", label: "Date" },
  { value: "probability", label: "Probability" },
];

const SOURCE_OPTIONS = [
  { value: "all", label: "All Sources" },
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "cold_outreach", label: "Cold Outreach" },
  { value: "event", label: "Event" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const DEFAULT_STAGES = [
  { id: "lead", name: "Lead", color: "#94a3b8" },
  { id: "qualified", name: "Qualified", color: "#60a5fa" },
  { id: "proposal", name: "Proposal", color: "#a78bfa" },
  { id: "negotiation", name: "Negotiation", color: "#f59e0b" },
  { id: "closed_won", name: "Won", color: "#10b981" },
  { id: "closed_lost", name: "Lost", color: "#ef4444" },
];

const PAGE_SIZE = 24;

export default function CRMPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();

  // Data
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [activePipeline, setActivePipeline] = useState<Pipeline | null>(null);

  // Loading
  const [initialLoading, setInitialLoading] = useState(true);
  const [filtering, setFiltering] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Filters
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [stageFilter, setStageFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("value");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  useDocumentTitle("CRM · Deals");

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  const buildParams = useCallback(
    (p: number) => {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", String(PAGE_SIZE));
      params.set("sortBy", sortBy === "date" ? "created" : sortBy);
      params.set("sortOrder", sortOrder);
      if (activePipeline) params.set("pipelineId", activePipeline.id);
      if (stageFilter !== "all") params.set("stageId", stageFilter);
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      return params;
    },
    [activePipeline, stageFilter, sourceFilter, statusFilter, debouncedSearch, sortBy, sortOrder]
  );

  // Fetch pipelines on mount
  useEffect(() => {
    fetch("/api/v1/crm/pipelines", { headers: getHeaders() })
      .then((r) => r.json())
      .then((data) => {
        const pipes = data.pipelines || [];
        setPipelines(pipes);
        setActivePipeline(pipes.find((p: Pipeline) => p.isDefault) || pipes[0] || null);
      })
      .catch(() => setError("Failed to load pipelines"));
  }, []);

  // Fetch deals when filters change
  const fetchDeals = useCallback(
    async (pageNum: number, replace: boolean) => {
      if (replace) setFiltering(true);
      else setLoadingMore(true);

      try {
        const res = await fetch(`/api/v1/crm/deals?${buildParams(pageNum)}`, {
          headers: getHeaders(),
        });
        const data = await res.json();

        if (replace) {
          setDeals(data.data || []);
        } else {
          setDeals((prev) => [...prev, ...(data.data || [])]);
        }

        if (data.summary) setSummary(data.summary);
        const t = data.pagination?.total ?? 0;
        setTotal(t);
        setHasMore(pageNum * PAGE_SIZE < t);
        setError(null);
      } catch {
        if (replace) setError("Failed to load deals");
      } finally {
        setInitialLoading(false);
        setFiltering(false);
        setLoadingMore(false);
      }
    },
    [buildParams]
  );

  // Reset + fetch when filters change
  useEffect(() => {
    if (!activePipeline && pipelines.length > 0) return;
    setPage(1);
    setHasMore(true);
    fetchDeals(1, true);
  }, [fetchDeals, activePipeline, pipelines.length]);

  // Re-fetch when a deal is created from the drawer
  useEffect(() => {
    const handler = () => {
      setPage(1);
      fetchDeals(1, true);
    };
    window.addEventListener("deals-changed", handler);
    return () => window.removeEventListener("deals-changed", handler);
  }, [fetchDeals]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !filtering && !initialLoading) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchDeals(nextPage, false);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, filtering, initialLoading, page, fetchDeals]);

  const stages = activePipeline?.stages?.length
    ? activePipeline.stages
    : DEFAULT_STAGES;

  // Stage distribution from API (full dataset, not paginated)
  const stageDistribution = useMemo(() => {
    if (!summary?.stageDistribution) return [];
    return stages.map((stage) => {
      const dist = summary.stageDistribution[stage.id];
      return { ...stage, count: dist?.count ?? 0, value: dist?.value ?? 0 };
    });
  }, [stages, summary]);

  function getStageInfo(stageId: string) {
    return stages.find((s) => s.id === stageId) || { name: stageId, color: "#94a3b8" };
  }

  async function handleSetupPipeline() {
    setSetupLoading(true);
    try {
      const res = await fetch("/api/v1/crm/pipelines", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          name: "Sales Pipeline",
          stages: DEFAULT_STAGES.map((s) => ({ id: s.id, name: s.name, color: s.color })),
          isDefault: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create pipeline");
      }
      window.location.reload();
      toast.success("Pipeline created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set up pipeline");
    } finally {
      setSetupLoading(false);
    }
  }

  const hasActiveFilters = stageFilter !== "all" || sourceFilter !== "all" || statusFilter !== "all" || debouncedSearch !== "";

  function clearFilters() {
    setStageFilter("all");
    setSourceFilter("all");
    setStatusFilter("all");
    setSearch("");
  }

  if (initialLoading) return <BrandLoader />;
  if (error && deals.length === 0) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  if (pipelines.length === 0 && deals.length === 0) {
    return (
      <ContentReveal>
        <div className="pt-12 pb-12 space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Sales Pipeline</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Track every deal from first contact to closed won. Visualize your pipeline, forecast revenue, and never let an opportunity slip through.
              </p>
            </div>
            <Button
              onClick={handleSetupPipeline}
              disabled={setupLoading}
              className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            >
              <Plus className="mr-2 size-4" />
              {setupLoading ? "Setting up..." : "Create Pipeline"}
            </Button>
          </div>

          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
            <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
              <div className="bg-muted/30 px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Example pipeline
                </p>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-5 overflow-hidden">
                  {DEFAULT_STAGES.slice(0, 5).map((stage, i) => (
                    <div key={stage.id} className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="size-2 rounded-full" style={{ backgroundColor: stage.color, opacity: 0.7 }} />
                        <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">{stage.name}</span>
                      </div>
                      {i < 4 && <ArrowRight className="size-3 text-muted-foreground/30 shrink-0" />}
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {[
                    { title: "Acme Corp - Enterprise Plan", contact: "Sarah Johnson", value: "$48,000", prob: "75%", stage: DEFAULT_STAGES[2] },
                    { title: "TechStart SaaS Migration", contact: "Mike Chen", value: "$24,500", prob: "60%", stage: DEFAULT_STAGES[1] },
                    { title: "GlobalRetail POS System", contact: "Lisa Park", value: "$120,000", prob: "30%", stage: DEFAULT_STAGES[0] },
                  ].map((deal) => (
                    <div key={deal.title} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: deal.stage.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{deal.title}</p>
                        <p className="text-[11px] text-muted-foreground">{deal.contact}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono font-medium tabular-nums">{deal.value}</p>
                        <p className="text-[10px] text-muted-foreground">{deal.prob}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 h-px bg-border" />
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground font-mono tabular-nums">3 deals · $192,500 in pipeline</p>
                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                    55% avg. probability
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                What you can do
              </p>
              {[
                { title: "Track deals through stages", desc: "Create deals, assign contacts, and drag them through your customizable pipeline stages.", icon: Handshake, color: "border-l-blue-400" },
                { title: "Forecast revenue", desc: "Set deal values and win probabilities to project expected revenue across your pipeline.", icon: DollarSign, color: "border-l-emerald-400" },
                { title: "Log every interaction", desc: "Record calls, emails, meetings, and notes so you never lose context on a deal.", icon: Users, color: "border-l-orange-400" },
                { title: "Analyze performance", desc: "Track conversion rates, deal velocity, and stage distribution at a glance.", icon: BarChart3, color: "border-l-violet-400" },
              ].map(({ title, desc, icon: Icon, color }) => (
                <div key={title} className={`rounded-lg border border-l-[3px] ${color} bg-card px-4 py-3`}>
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium">{title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 ml-[22px]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      <PageHeader
        title="Sales Pipeline"
        description={
          summary
            ? `${summary.totalDeals} deal${summary.totalDeals !== 1 ? "s" : ""} · ${formatMoney(summary.activeValue)} in pipeline`
            : undefined
        }
      >
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => openDrawer("deal")}>
          <Plus className="size-3" /> New Deal
        </Button>
      </PageHeader>

      {/* Pipeline funnel bar */}
      {summary && summary.activeCount > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <BarChart3 className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Stage Distribution</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">{summary.activeCount} active</span>
              {summary.wonCount > 0 && (
                <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {summary.wonCount} won · {formatMoney(summary.wonValue)}
                </span>
              )}
            </div>
          </div>

          <div className="flex h-3 rounded-full overflow-hidden bg-muted">
            {stageDistribution.filter((s) => s.count > 0).map((stage) => (
              <div
                key={stage.id}
                className="transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${(stage.count / (summary.activeCount || 1)) * 100}%`,
                  backgroundColor: stage.color,
                  opacity: 0.8,
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
            {stageDistribution.filter((s) => s.count > 0).map((stage) => (
              <button
                key={stage.id}
                onClick={() => setStageFilter(stageFilter === stage.id ? "all" : stage.id)}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] transition-colors",
                  stageFilter === stage.id ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                {stage.name} ({stage.count}) · {formatMoney(stage.value)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stage tabs */}
      <div className="flex flex-col gap-3">
        <div className="relative flex items-center gap-1 rounded-lg bg-muted p-1 w-fit overflow-x-auto">
          {[{ id: "all", name: "All", color: "" }, ...stages.filter((s) => s.id !== "closed_lost")].map((s) => {
            const isActive = stageFilter === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setStageFilter(s.id)}
                className={cn(
                  "relative z-10 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="crm-tab-indicator"
                    className="absolute inset-0 rounded-md bg-background shadow-sm"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                {s.color && (
                  <span className="relative z-10 size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                )}
                <span className="relative z-10">{s.name}</span>
              </button>
            );
          })}
        </div>

        {/* Search + filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search deals, contacts..."
            loading={search !== debouncedSearch}
          />

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs">
              <Filter className="size-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-full sm:w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-8 w-full sm:w-[120px] text-xs">
              <ArrowUpDown className="size-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setSortOrder((p) => (p === "asc" ? "desc" : "asc"))}
          >
            <ArrowUpDown className={cn("size-3.5 transition-transform", sortOrder === "asc" && "rotate-180")} />
          </Button>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={clearFilters}>
              <X className="size-3" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Results count */}
      {!filtering && (
        <p className="text-[11px] text-muted-foreground">
          {total} deal{total !== 1 ? "s" : ""}
          {hasActiveFilters && " matching filters"}
        </p>
      )}

      {/* Deal list */}
      {filtering ? (
        <BrandLoader />
      ) : deals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
            <Handshake className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No deals found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {hasActiveFilters ? "Try different filters" : "Create your first deal to get started"}
          </p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" className="mt-3 h-7 text-xs" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {deals.map((deal) => {
              const stage = getStageInfo(deal.stageId);
              const isWon = !!deal.wonAt;
              const isLost = !!deal.lostAt;

              return (
                <button
                  key={deal.id}
                  onClick={() => router.push(`/crm/deals/${deal.id}`)}
                  className="w-full rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{deal.title}</p>
                      {deal.contact && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <User className="size-3 text-muted-foreground shrink-0" />
                          <p className="text-[11px] text-muted-foreground truncate">{deal.contact.name}</p>
                        </div>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 text-[10px] gap-1"
                      style={{
                        borderColor: stage.color + "40",
                        backgroundColor: stage.color + "10",
                        color: stage.color,
                      }}
                    >
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
                      {isWon ? "Won" : isLost ? "Lost" : stage.name}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold font-mono tabular-nums tracking-tight">
                      {formatMoney(deal.valueCents, deal.currency)}
                    </span>
                    {deal.probability !== null && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${deal.probability}%`,
                              backgroundColor:
                                deal.probability >= 70 ? "#10b981" : deal.probability >= 40 ? "#f59e0b" : "#94a3b8",
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                          {deal.probability}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 pt-2 border-t text-[11px] text-muted-foreground">
                    {deal.expectedCloseDate && (
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        {new Date(deal.expectedCloseDate).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                    {deal.source && <span className="capitalize">{deal.source.replace("_", " ")}</span>}
                    {deal.assignedUser && (
                      <span className="ml-auto truncate max-w-[100px]">{deal.assignedUser.name}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="flex items-center justify-center py-4">
            {loadingMore && <Loader2 className="size-5 text-muted-foreground animate-spin" />}
            {!hasMore && deals.length > 0 && (
              <p className="text-xs text-muted-foreground/50">No more deals</p>
            )}
          </div>
        </>
      )}
    </ContentReveal>
  );
}

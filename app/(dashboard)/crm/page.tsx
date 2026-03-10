"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import { Users, Handshake, BarChart3, ArrowRight, Plus, DollarSign, ArrowUpDown, Calendar, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { PageHeader } from "@/components/dashboard/page-header";
import { ContentReveal } from "@/components/ui/content-reveal";
import { SearchInput } from "@/components/ui/search-input";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { formatMoney } from "@/lib/money";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

type StageFilter = "all" | string;
type SortKey = "value" | "name" | "date" | "probability";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "value", label: "Value" },
  { value: "name", label: "Name" },
  { value: "date", label: "Date" },
  { value: "probability", label: "Probability" },
];

interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string; color: string }[];
  isDefault: boolean;
}

const DEFAULT_STAGES = [
  { id: "lead", name: "Lead", color: "#94a3b8" },
  { id: "qualified", name: "Qualified", color: "#60a5fa" },
  { id: "proposal", name: "Proposal", color: "#a78bfa" },
  { id: "negotiation", name: "Negotiation", color: "#f59e0b" },
  { id: "closed_won", name: "Won", color: "#10b981" },
  { id: "closed_lost", name: "Lost", color: "#ef4444" },
];

const EASE = [0.22, 1, 0.36, 1] as const;


export default function CRMPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePipeline, setActivePipeline] = useState<Pipeline | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

  // Search, filter, sort state
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const pendingSearch = search !== debouncedSearch;
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("value");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  const fetchCRM = useCallback(async () => {
    try {
      const [pData, dData] = await Promise.all([
        fetch("/api/v1/crm/pipelines", { headers: getHeaders() }).then((r) => r.json()),
        fetch("/api/v1/crm/deals", { headers: getHeaders() }).then((r) => r.json()),
      ]);
      const pipes = pData.pipelines || [];
      setPipelines(pipes);
      setDeals(dData.data || []);
      setActivePipeline(pipes.find((p: Pipeline) => p.isDefault) || pipes[0] || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCRM();
  }, [fetchCRM]);

  // Re-fetch when a deal is created from the drawer
  useEffect(() => {
    const handler = () => fetchCRM();
    window.addEventListener("deals-changed", handler);
    return () => window.removeEventListener("deals-changed", handler);
  }, [fetchCRM]);

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
      await fetchCRM();
      toast.success("Pipeline created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set up pipeline");
    } finally {
      setSetupLoading(false);
    }
  }

  const stages = activePipeline?.stages?.length
    ? activePipeline.stages
    : DEFAULT_STAGES;

  const pipelineDeals = activePipeline
    ? deals.filter(() => true)
    : deals;

  const activeDeals = pipelineDeals.filter((d) => !d.wonAt && !d.lostAt);
  const pipelineValue = activeDeals.reduce((s, d) => s + d.valueCents, 0);
  const wonDeals = pipelineDeals.filter((d) => d.wonAt);
  const wonValue = wonDeals.reduce((s, d) => s + d.valueCents, 0);

  // Stage distribution for the funnel bar
  const stageDistribution = useMemo(() => {
    return stages.map((stage) => {
      const count = activeDeals.filter((d) => d.stageId === stage.id).length;
      const value = activeDeals.filter((d) => d.stageId === stage.id).reduce((s, d) => s + d.valueCents, 0);
      return { ...stage, count, value };
    });
  }, [stages, activeDeals]);

  // Filter + sort
  const filteredDeals = useMemo(() => {
    let result = [...pipelineDeals];

    if (stageFilter !== "all") {
      result = result.filter((d) => d.stageId === stageFilter);
    }

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter((d) => {
        return (
          d.title.toLowerCase().includes(q) ||
          d.contact?.name.toLowerCase().includes(q) ||
          d.assignedUser?.name.toLowerCase().includes(q)
        );
      });
    }

    const dir = sortOrder === "asc" ? 1 : -1;
    result.sort((a, b) => {
      switch (sortBy) {
        case "value":
          return dir * (a.valueCents - b.valueCents);
        case "name":
          return dir * a.title.localeCompare(b.title);
        case "date":
          return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        case "probability":
          return dir * ((a.probability || 0) - (b.probability || 0));
        default:
          return 0;
      }
    });

    return result;
  }, [pipelineDeals, stageFilter, debouncedSearch, sortBy, sortOrder]);

  function getStageInfo(stageId: string) {
    return stages.find((s) => s.id === stageId) || { name: stageId, color: "#94a3b8" };
  }

  if (loading) return <BrandLoader />;

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
                {
                  title: "Track deals through stages",
                  desc: "Create deals, assign contacts, and drag them through your customizable pipeline stages.",
                  icon: Handshake,
                  color: "border-l-blue-400",
                },
                {
                  title: "Forecast revenue",
                  desc: "Set deal values and win probabilities to project expected revenue across your pipeline.",
                  icon: DollarSign,
                  color: "border-l-emerald-400",
                },
                {
                  title: "Log every interaction",
                  desc: "Record calls, emails, meetings, and notes so you never lose context on a deal.",
                  icon: Users,
                  color: "border-l-orange-400",
                },
                {
                  title: "Analyze performance",
                  desc: "Track conversion rates, deal velocity, and stage distribution at a glance.",
                  icon: BarChart3,
                  color: "border-l-violet-400",
                },
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
        description={`${pipelineDeals.length} deal${pipelineDeals.length !== 1 ? "s" : ""} · ${formatMoney(pipelineValue)} in pipeline`}
      >
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => openDrawer("deal")}>
          <Plus className="size-3" /> New Deal
        </Button>
      </PageHeader>

      {/* Pipeline funnel bar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border bg-card p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BarChart3 className="size-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Stage Distribution</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{activeDeals.length} active</span>
            {wonDeals.length > 0 && (
              <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{wonDeals.length} won · {formatMoney(wonValue)}</span>
            )}
          </div>
        </div>

        {/* Segmented bar */}
        {activeDeals.length > 0 ? (
          <>
            <div className="flex h-3 rounded-full overflow-hidden bg-muted">
              {stageDistribution.filter((s) => s.count > 0).map((stage) => (
                <div
                  key={stage.id}
                  className="transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${(stage.count / activeDeals.length) * 100}%`,
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
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No active deals yet</p>
        )}
      </motion.div>

      {/* Toolbar: tabs + search + sort */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={stageFilter} onValueChange={(v) => setStageFilter(v as StageFilter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              {stages.filter((s) => s.id !== "closed_lost").map((s) => (
                <TabsTrigger key={s.id} value={s.id} className="gap-1.5">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search deals, contacts..."
            loading={pendingSearch}
          />

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-8 w-full sm:w-[150px] text-xs">
              <ArrowUpDown className="size-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => setSortOrder((p) => p === "asc" ? "desc" : "asc")}>
            <ArrowUpDown className={cn("size-3.5 transition-transform", sortOrder === "asc" && "rotate-180")} />
          </Button>
        </div>
      </div>

      {/* Deal list */}
      {pendingSearch ? (
        <div className="flex items-center justify-center py-20">
          <div className="brand-loader" aria-label="Loading">
            <div className="brand-loader-circle brand-loader-circle-1" />
            <div className="brand-loader-circle brand-loader-circle-2" />
          </div>
        </div>
      ) : filteredDeals.length === 0 ? (
        <ContentReveal>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <Handshake className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No deals found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Try a different search term" : "No deals match this filter"}
            </p>
          </div>
        </ContentReveal>
      ) : (
        <MotionConfig reducedMotion="never">
          <motion.div
            key={`${debouncedSearch}-${sortBy}-${sortOrder}`}
            initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{ willChange: "opacity, transform, filter" }}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDeals.map((deal) => {
                const stage = getStageInfo(deal.stageId);
                const isWon = !!deal.wonAt;
                const isLost = !!deal.lostAt;

                return (
                  <button
                    key={deal.id}
                    onClick={() => router.push(`/crm/deals/${deal.id}`)}
                    className="w-full rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/50 space-y-3"
                  >
                    {/* Header: stage + badge */}
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

                    {/* Value + probability */}
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
                                backgroundColor: deal.probability >= 70 ? "#10b981" : deal.probability >= 40 ? "#f59e0b" : "#94a3b8",
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono tabular-nums">{deal.probability}%</span>
                        </div>
                      )}
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-3 pt-2 border-t text-[11px] text-muted-foreground">
                      {deal.expectedCloseDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {new Date(deal.expectedCloseDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      )}
                      {deal.source && (
                        <span className="capitalize">{deal.source.replace("_", " ")}</span>
                      )}
                      {deal.assignedUser && (
                        <span className="ml-auto truncate max-w-[100px]">{deal.assignedUser.name}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </MotionConfig>
      )}
    </ContentReveal>
  );
}

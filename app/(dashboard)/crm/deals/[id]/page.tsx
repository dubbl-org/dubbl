"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import {
  ArrowLeft,
  MessageSquare,
  Mail,
  Phone,
  Calendar,
  ClipboardList,
  Trophy,
  XCircle,
  Send,
  FileText,
  Activity,
  Settings2,
  User,
  DollarSign,
  Target,
  Briefcase,
  Check,
  ArrowUpDown,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { SearchInput } from "@/components/ui/search-input";
import { Section } from "@/components/dashboard/section";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { cn } from "@/lib/utils";

interface DealDetail {
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

const ACTIVITY_ICONS: Record<string, typeof MessageSquare> = {
  note: MessageSquare,
  email: Mail,
  call: Phone,
  meeting: Calendar,
  task: ClipboardList,
};

const ACTIVITY_COLORS: Record<string, string> = {
  note: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  email: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
  call: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
  meeting: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
  task: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
};

const ACTIVITY_BAR_COLORS: Record<string, string> = {
  note: "#64748b",
  email: "#3b82f6",
  call: "#10b981",
  meeting: "#8b5cf6",
  task: "#f59e0b",
};

const SOURCE_LABELS: Record<string, string> = {
  website: "Website",
  referral: "Referral",
  cold_outreach: "Cold Outreach",
  event: "Event",
  other: "Other",
};

const TABS = [
  { value: "overview", label: "Overview", icon: FileText },
  { value: "activity", label: "Activity", icon: Activity },
  { value: "settings", label: "Settings", icon: Settings2 },
] as const;

type Tab = (typeof TABS)[number]["value"];

function timeAgo(dateStr: string) {
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

interface ActivityItem {
  id: string;
  type: string;
  content: string | null;
  createdAt: string;
  user: { name: string | null } | null;
}

type ActivitySortKey = "date" | "type";

const ACTIVITY_SORT_OPTIONS: { value: ActivitySortKey; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "type", label: "Type" },
];

const EASE = [0.22, 1, 0.36, 1] as const;

function ActivityTab({
  dealId,
  deal,
  activityType,
  setActivityType,
  activityContent,
  setActivityContent,
  submitting,
  addActivity,
  getHeaders,
}: {
  dealId: string;
  deal: DealDetail;
  activityType: string;
  setActivityType: (t: string) => void;
  activityContent: string;
  setActivityContent: (c: string) => void;
  submitting: boolean;
  addActivity: () => Promise<void>;
  getHeaders: () => Record<string, string>;
}) {
  const isWon = !!deal.wonAt;
  const isLost = !!deal.lostAt;
  const isClosed = isWon || isLost;
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  // Search, filter, sort
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const pendingSearch = search !== debouncedSearch;
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<ActivitySortKey>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Pagination
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const sentinelRef = useRef<HTMLDivElement>(null);

  function buildParams(pg: number) {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (typeFilter !== "all") params.set("type", typeFilter);
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    params.set("page", String(pg));
    params.set("limit", "30");
    return params;
  }

  // Fetch page 1 on filter/search/sort change
  useEffect(() => {
    let cancelled = false;
    const isRefetch = !loading;

    setPage(1);
    setHasMore(true);
    if (isRefetch) setRefetching(true);

    const params = buildParams(1);

    fetch(`/api/v1/crm/deals/${dealId}/activities?${params}`, {
      headers: getHeaders(),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.activities) setActivities(data.activities);
        if (data.pagination) {
          setTotal(data.pagination.total);
          setHasMore(data.pagination.page < data.pagination.totalPages);
        }
        if (data.typeCounts) setTypeCounts(data.typeCounts);
        if (data.totalAll != null) setTotalAll(data.totalAll);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefetching(false);
          setFetchKey((k) => k + 1);
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, debouncedSearch, typeFilter, sortBy, sortOrder]);

  // Load more
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);

    const params = buildParams(nextPage);

    fetch(`/api/v1/crm/deals/${dealId}/activities?${params}`, {
      headers: getHeaders(),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.activities) setActivities((prev) => [...prev, ...data.activities]);
        if (data.pagination) {
          setPage(data.pagination.page);
          setTotal(data.pagination.total);
          setHasMore(data.pagination.page < data.pagination.totalPages);
        }
      })
      .finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, hasMore, page, dealId, debouncedSearch, typeFilter, sortBy, sortOrder]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  // Refresh activities after adding one
  async function handleAddActivity() {
    await addActivity();
    // Refetch page 1
    setRefetching(true);
    const params = buildParams(1);
    try {
      const r = await fetch(`/api/v1/crm/deals/${dealId}/activities?${params}`, {
        headers: getHeaders(),
      });
      const data = await r.json();
      if (data.activities) setActivities(data.activities);
      if (data.pagination) {
        setPage(1);
        setTotal(data.pagination.total);
        setHasMore(data.pagination.page < data.pagination.totalPages);
      }
      if (data.typeCounts) setTypeCounts(data.typeCounts);
      if (data.totalAll != null) setTotalAll(data.totalAll);
    } finally {
      setRefetching(false);
      setFetchKey((k) => k + 1);
    }
  }

  // Group activities by date
  function groupByDate(items: ActivityItem[]) {
    const grouped: { label: string; date: string; items: ActivityItem[] }[] = [];
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

    for (const activity of items) {
      const date = activity.createdAt.slice(0, 10);
      const label =
        date === today
          ? "Today"
          : date === yesterday
            ? "Yesterday"
            : new Date(activity.createdAt).toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              });

      const existing = grouped.find((g) => g.date === date);
      if (existing) existing.items.push(activity);
      else grouped.push({ label, date, items: [activity] });
    }
    return grouped;
  }

  const grouped = groupByDate(activities);
  const hasFilters = search || typeFilter !== "all";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="brand-loader" aria-label="Loading">
          <div className="brand-loader-circle brand-loader-circle-1" />
          <div className="brand-loader-circle brand-loader-circle-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      {/* Main column */}
      <div className="space-y-4">
        {/* Won/Lost status */}
        {isWon && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 px-4 py-3">
            <Trophy className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-300">Deal won</p>
              <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/60">
                Closed on {new Date(deal.wonAt!).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                {deal.valueCents > 0 && <> · {formatMoney(deal.valueCents, deal.currency)}</>}
              </p>
            </div>
          </div>
        )}
        {isLost && (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3">
            <XCircle className="size-4 text-red-600 dark:text-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-red-700 dark:text-red-300">Deal lost</p>
              <p className="text-[11px] text-red-600/70 dark:text-red-400/60">
                {deal.lostReason
                  ? deal.lostReason
                  : `Closed on ${new Date(deal.lostAt!).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`}
              </p>
            </div>
          </div>
        )}

        {/* Composer card */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold mb-1">Log Activity</h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ACTIVITY_ICONS).map(([type, Icon]) => (
              <button
                key={type}
                onClick={() => setActivityType(type)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  activityType === type
                    ? ACTIVITY_COLORS[type]
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3" />
                <span className="capitalize">{type}</span>
              </button>
            ))}
          </div>
          <Textarea
            placeholder={`Add a ${activityType}...`}
            value={activityContent}
            onChange={(e) => setActivityContent(e.target.value)}
            className="min-h-[80px] text-sm resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && activityContent.trim()) {
                handleAddActivity();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              {typeof navigator !== "undefined" && navigator.platform?.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to submit
            </p>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              onClick={handleAddActivity}
              disabled={!activityContent.trim() || submitting}
            >
              <Send className="size-3" />
              {submitting ? "Adding..." : "Add Activity"}
            </Button>
          </div>
        </div>

        {/* Toolbar: search + type filter + sort */}
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search activities..."
            loading={pendingSearch}
          />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-full sm:w-[130px] text-xs">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(ACTIVITY_ICONS).map(([type]) => (
                <SelectItem key={type} value={type} className="capitalize">
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as ActivitySortKey)}>
            <SelectTrigger className="h-8 w-full sm:w-[120px] text-xs">
              <ArrowUpDown className="size-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_SORT_OPTIONS.map((opt) => (
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
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => { setSearch(""); setTypeFilter("all"); }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Stats row */}
        {total > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground px-1">
            <span className="font-medium text-foreground tabular-nums">{total}</span> activities
            {hasFilters && (
              <>
                <span>·</span>
                <span className="tabular-nums">{activities.length} shown</span>
              </>
            )}
          </div>
        )}

        {/* Activity list */}
        {refetching || pendingSearch ? (
          <div className="flex items-center justify-center py-20">
            <div className="brand-loader" aria-label="Loading">
              <div className="brand-loader-circle brand-loader-circle-1" />
              <div className="brand-loader-circle brand-loader-circle-2" />
            </div>
          </div>
        ) : activities.length === 0 ? (
          <ContentReveal>
            <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-16 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
                <Activity className="size-5 text-muted-foreground" />
              </div>
              {hasFilters ? (
                <>
                  <p className="text-sm font-medium">No matching activities</p>
                  <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs mt-2"
                    onClick={() => { setSearch(""); setTypeFilter("all"); }}
                  >
                    Clear filters
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">No activity yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Log your first activity above</p>
                </>
              )}
            </div>
          </ContentReveal>
        ) : (
          <MotionConfig reducedMotion="never">
            <motion.div
              key={fetchKey}
              initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.5, ease: EASE }}
              style={{ willChange: "opacity, transform, filter" }}
              className="space-y-4"
            >
              <div className="space-y-0">
                {grouped.map((group, gi) => (
                  <div key={group.date}>
                    {/* Day header with dot on timeline */}
                    <div className="relative flex items-center gap-3 py-3 pl-[9px]">
                      {gi > 0 && (
                        <div className="absolute left-[12px] -top-0 h-3 w-px bg-border" />
                      )}
                      <div className="relative z-10 flex size-2 shrink-0 rounded-full bg-border ring-4 ring-background" />
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                        {group.label}
                      </p>
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[10px] tabular-nums text-muted-foreground/40">
                        {group.items.length}
                      </span>
                    </div>

                    {/* Timeline entries */}
                    <div className="relative">
                      <div className="absolute left-[12px] top-0 bottom-0 w-px bg-border" />

                      {group.items.map((activity, i) => {
                        const Icon = ACTIVITY_ICONS[activity.type] || MessageSquare;
                        const colorClass = ACTIVITY_COLORS[activity.type] || ACTIVITY_COLORS.note;
                        const isLastEntry = i === group.items.length - 1 && gi === grouped.length - 1;

                        return (
                          <div
                            key={activity.id}
                            className={cn(
                              "relative flex items-start gap-3 pr-3 py-2.5 transition-colors hover:bg-muted/30 rounded-lg group",
                              isLastEntry && "pb-4"
                            )}
                          >
                            {/* Timeline node */}
                            <div className="relative z-10 mt-1 shrink-0">
                              <div className={cn(
                                "flex size-[26px] items-center justify-center rounded-md ring-2 ring-background",
                                colorClass
                              )}>
                                <Icon className="size-3" />
                              </div>
                            </div>

                            {/* Content card */}
                            <div className="flex-1 min-w-0 flex items-start justify-between gap-3 rounded-lg border bg-card px-3.5 py-2.5 shadow-xs transition-shadow group-hover:shadow-sm">
                              <div className="min-w-0">
                                <p className="text-[13px] leading-snug">
                                  <span className="font-medium">{activity.user?.name || "System"}</span>{" "}
                                  <span className="text-muted-foreground">logged a</span>{" "}
                                  <span className="font-medium capitalize">{activity.type}</span>
                                </p>
                                {activity.content && (
                                  <p className="text-[13px] text-muted-foreground mt-1.5 whitespace-pre-wrap leading-relaxed">
                                    {activity.content}
                                  </p>
                                )}
                              </div>

                              {/* Timestamp */}
                              <div className="text-right shrink-0">
                                <p className="text-[11px] text-muted-foreground tabular-nums">
                                  {new Date(activity.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </p>
                                <p className="text-[10px] text-muted-foreground/40 hidden sm:block">
                                  {timeAgo(activity.createdAt)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </MotionConfig>
        )}

        {/* Infinite scroll sentinel */}
        {hasMore && !refetching && (
          <div ref={sentinelRef} className="flex items-center justify-center py-6">
            {loadingMore && (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        {/* Filter by type */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Filter by Type</h3>
          <div className="space-y-1.5">
            {Object.entries(ACTIVITY_ICONS).map(([type, Icon]) => {
              const isActive = typeFilter === type;
              const count = typeCounts[type] || 0;
              const barWidth = totalAll > 0 ? Math.max(8, Math.round((count / totalAll) * 100)) : 0;
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(isActive ? "all" : type)}
                  className={cn(
                    "flex items-center gap-2.5 w-full rounded-lg px-2 py-2 transition-all",
                    isActive ? "bg-muted shadow-xs" : "hover:bg-muted/50"
                  )}
                >
                  <div className={cn("flex size-6 items-center justify-center rounded-md", ACTIVITY_COLORS[type])}>
                    <Icon className="size-3" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center justify-between">
                      <span className={cn("text-xs capitalize", isActive && "font-medium")}>{type}s</span>
                      <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                        {count}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-muted mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: ACTIVITY_BAR_COLORS[type] || "#94a3b8",
                        }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between px-2">
            <span className="text-xs text-muted-foreground">Total activities</span>
            <span className="text-xs font-mono tabular-nums font-bold">{totalAll}</span>
          </div>
        </div>

        {/* Quick stats */}
        {activities.length > 0 && (
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Stats</h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">First logged</span>
                <span className="text-xs tabular-nums">
                  {new Date(activities[activities.length - 1].createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Most recent</span>
                <span className="text-xs tabular-nums">
                  {timeAgo(activities[0].createdAt)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Most common</span>
                <span className="text-xs capitalize">
                  {Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "-"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [activityType, setActivityType] = useState("note");
  const [activityContent, setActivityContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stageChanging, setStageChanging] = useState(false);

  const [saving, setSaving] = useState(false);

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  async function fetchDeal() {
    try {
      const res = await fetch(`/api/v1/crm/deals/${id}`, { headers: getHeaders() });
      const data = await res.json();
      if (data.deal) setDeal(data.deal);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchDeal(); }, [id]);

  async function handleSettingsSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!deal) return;
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/v1/crm/deals/${id}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({
          title: form.get("title") as string,
          notes: (form.get("notes") as string) || null,
          probability: form.get("probability") ? parseInt(form.get("probability") as string) : null,
          expectedCloseDate: (form.get("expectedCloseDate") as string) || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update deal");
      await fetchDeal();
      toast.success("Deal updated");
    } catch {
      toast.error("Failed to update deal");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed = await confirm({
      title: `Delete "${deal?.title}"?`,
      description: "This deal and all its activities will be permanently removed. This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/v1/crm/deals/${id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete deal");
      toast.success("Deal deleted");
      router.push("/crm");
    } catch {
      toast.error("Failed to delete deal");
    }
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

  if (loading) return <BrandLoader />;
  if (!deal) return <div className="py-20 text-center text-sm text-muted-foreground">Deal not found</div>;

  const stages = deal.pipeline?.stages || [];
  const currentStage = stages.find((s) => s.id === deal.stageId);
  const currentStageIdx = stages.findIndex((s) => s.id === deal.stageId);
  const isWon = !!deal.wonAt;
  const isLost = !!deal.lostAt;
  const isClosed = isWon || isLost;

  return (
    <ContentReveal>
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
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2.5 pt-3 text-[13px] font-medium transition-colors",
                tab === t.value
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
      <ContentReveal key={tab}>
        {tab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            {/* Main content */}
            <div className="space-y-4">
              {/* Deal info card */}
              <div className="rounded-xl border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold">Deal Information</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Contact</p>
                      {deal.contact ? (
                        <div>
                          <p className="text-sm font-medium">{deal.contact.name}</p>
                          {deal.contact.email && (
                            <p className="text-xs text-muted-foreground">{deal.contact.email}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">-</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Assigned To</p>
                      <p className="text-sm">{deal.assignedUser?.name || "-"}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Source</p>
                      <p className="text-sm">{deal.source ? (SOURCE_LABELS[deal.source] || deal.source) : "-"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Expected Close</p>
                      <p className="text-sm">
                        {deal.expectedCloseDate
                          ? new Date(deal.expectedCloseDate).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
                          : "-"}
                      </p>
                    </div>
                  </div>
                </div>
                {deal.notes && (
                  <>
                    <div className="h-px bg-border" />
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Notes</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{deal.notes}</p>
                    </div>
                  </>
                )}
                {deal.lostReason && (
                  <>
                    <div className="h-px bg-border" />
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Lost Reason</p>
                      <p className="text-sm text-red-600 dark:text-red-400">{deal.lostReason}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Recent activity preview */}
              <div className="rounded-xl border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Recent Activity</h3>
                  {deal.activities.length > 0 && (
                    <button
                      onClick={() => setTab("activity")}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      View all ({deal.activities.length})
                    </button>
                  )}
                </div>
                {deal.activities.length === 0 ? (
                  <div className="py-4 text-center">
                    <Activity className="size-6 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No activity yet</p>
                    <button
                      onClick={() => setTab("activity")}
                      className="text-xs text-emerald-600 hover:underline mt-1 font-medium"
                    >
                      Log first activity
                    </button>
                  </div>
                ) : (
                  <div className="divide-y">
                    {deal.activities.slice(0, 3).map((activity) => {
                      const Icon = ACTIVITY_ICONS[activity.type] || MessageSquare;
                      return (
                        <div key={activity.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                          <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", ACTIVITY_COLORS[activity.type] || ACTIVITY_COLORS.note)}>
                            <Icon className="size-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">{activity.user?.name || "System"}</span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize h-3.5">{activity.type}</Badge>
                              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{timeAgo(activity.createdAt)}</span>
                            </div>
                            {activity.content && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{activity.content}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Key metrics */}
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Key Metrics</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                      <DollarSign className="size-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold font-mono tabular-nums">{formatMoney(deal.valueCents, deal.currency)}</p>
                      <p className="text-[10px] text-muted-foreground">Deal Value</p>
                    </div>
                  </div>
                  {deal.probability !== null && (
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
                        <Target className="size-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold tabular-nums">{deal.probability}%</p>
                          <p className="text-[10px] text-muted-foreground font-mono tabular-nums">
                            {formatMoney(Math.round(deal.valueCents * (deal.probability / 100)), deal.currency)}
                          </p>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${deal.probability}%`,
                              backgroundColor: deal.probability >= 70 ? "#10b981" : deal.probability >= 40 ? "#f59e0b" : "#94a3b8",
                            }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Weighted Value</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Pipeline stages */}
              {stages.length > 0 && (
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pipeline Stage</h3>
                  <div className="space-y-1">
                    {stages.map((stage, idx) => {
                      const isCurrent = stage.id === deal.stageId;
                      const isPast = idx < currentStageIdx;
                      return (
                        <button
                          key={stage.id}
                          disabled={isClosed || stageChanging}
                          onClick={() => !isClosed && changeStage(stage.id)}
                          className={cn(
                            "flex items-center gap-2 w-full rounded-lg px-2.5 py-1.5 text-left transition-colors",
                            isCurrent && "bg-muted",
                            !isClosed && !isCurrent && "hover:bg-muted/50 cursor-pointer",
                            isClosed && "cursor-default"
                          )}
                        >
                          <div className="relative flex items-center justify-center size-4 shrink-0">
                            {isPast || (isWon && stage.id !== "closed_lost") ? (
                              <div className="size-4 rounded-full flex items-center justify-center" style={{ backgroundColor: stage.color }}>
                                <Check className="size-2.5 text-white" />
                              </div>
                            ) : (
                              <div
                                className={cn("size-3 rounded-full border-2", isCurrent ? "border-0" : "")}
                                style={{
                                  backgroundColor: isCurrent ? stage.color : "transparent",
                                  borderColor: isCurrent ? stage.color : "#d1d5db",
                                }}
                              />
                            )}
                          </div>
                          <span className={cn("text-xs", isCurrent ? "font-medium" : "text-muted-foreground")}>
                            {stage.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Created date */}
              <div className="rounded-xl border bg-card p-4">
                <p className="text-[11px] text-muted-foreground">
                  Created {new Date(deal.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                </p>
                {deal.wonAt && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
                    Won {new Date(deal.wonAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                )}
                {deal.lostAt && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                    Lost {new Date(deal.lostAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "activity" && (
          <ActivityTab
            dealId={id}
            deal={deal}
            activityType={activityType}
            setActivityType={setActivityType}
            activityContent={activityContent}
            setActivityContent={setActivityContent}
            submitting={submitting}
            addActivity={addActivity}
            getHeaders={getHeaders}
          />
        )}

        {tab === "settings" && (
          <form onSubmit={handleSettingsSubmit} className="space-y-10">
            <Section title="General" description="Basic deal information and identification.">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Deal Title</Label>
                  <Input name="title" required defaultValue={deal.title} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Probability (%)</Label>
                    <Input
                      name="probability"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={deal.probability ?? ""}
                      placeholder="0-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Expected Close Date</Label>
                    <Input
                      name="expectedCloseDate"
                      type="date"
                      defaultValue={deal.expectedCloseDate || ""}
                    />
                  </div>
                </div>
              </div>
            </Section>

            <div className="h-px bg-border" />

            <Section title="Details" description="Source, contact, and assignment info.">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Source</Label>
                  <Input
                    value={deal.source ? (SOURCE_LABELS[deal.source] || deal.source) : "-"}
                    disabled
                    className="bg-muted/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Contact</Label>
                  <Input
                    value={deal.contact?.name || "-"}
                    disabled
                    className="bg-muted/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Assigned To</Label>
                  <Input
                    value={deal.assignedUser?.name || "-"}
                    disabled
                    className="bg-muted/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Value</Label>
                  <Input
                    value={formatMoney(deal.valueCents, deal.currency)}
                    disabled
                    className="bg-muted/50 font-mono tabular-nums"
                  />
                </div>
              </div>
            </Section>

            <div className="h-px bg-border" />

            <Section title="Notes" description="Internal notes about this deal.">
              <Textarea
                name="notes"
                defaultValue={deal.notes || ""}
                rows={3}
                placeholder="Add notes about this deal..."
              />
            </Section>

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>

            <div className="h-px bg-border" />

            <Section title="Danger zone" description="Irreversible actions for this deal.">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">Delete this deal</p>
                  <p className="text-xs text-red-600/70 dark:text-red-400/60">Once deleted, this cannot be undone.</p>
                </div>
                <Button type="button" size="sm" variant="destructive" onClick={handleDelete}>
                  Delete Deal
                </Button>
              </div>
            </Section>
          </form>
        )}
      </ContentReveal>

      {confirmDialog}
    </ContentReveal>
  );
}

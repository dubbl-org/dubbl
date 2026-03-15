"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Calendar, X, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";

interface RecurringTemplate {
  id: string;
  name: string;
  type: string;
  frequency: string;
  status: string;
  startDate: string;
  endDate: string | null;
  nextRunDate: string | null;
  lastRunDate: string | null;
  occurrencesGenerated: number;
  maxOccurrences: number | null;
  contact: { name: string } | null;
}

const statusColors: Record<string, string> = {
  active:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  paused:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  completed:
    "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

const frequencyLabels: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-Annual",
  annual: "Annual",
};

function buildColumns(): Column<RecurringTemplate>[] {
  return [
    {
      key: "name",
      header: "Name",
      sortKey: "name",
      render: (r) => <span className="text-sm font-medium">{r.name}</span>,
    },
    {
      key: "contact",
      header: "Customer",
      render: (r) => (
        <span className="text-sm font-medium">{r.contact?.name || "-"}</span>
      ),
    },
    {
      key: "frequency",
      header: "Frequency",
      sortKey: "frequency",
      className: "w-32",
      render: (r) => (
        <span className="text-sm">
          {frequencyLabels[r.frequency] || r.frequency}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "w-28",
      render: (r) => (
        <Badge variant="outline" className={statusColors[r.status] || ""}>
          {r.status}
        </Badge>
      ),
    },
    {
      key: "nextRun",
      header: "Next Run",
      sortKey: "nextRun",
      className: "w-28",
      render: (r) => <span className="text-sm">{r.nextRunDate || "-"}</span>,
    },
    {
      key: "startDate",
      header: "Start Date",
      sortKey: "startDate",
      className: "w-28",
      render: (r) => <span className="text-sm">{r.startDate}</span>,
    },
    {
      key: "occurrences",
      header: "Occurrences",
      className: "w-28 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {r.occurrencesGenerated} / {r.maxOccurrences ?? "\u221E"}
        </span>
      ),
    },
  ];
}

export default function RecurringInvoicesPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [fetchKey, setFetchKey] = useState(0);
  const [summary, setSummary] = useState<{
    totalCount: number;
    activeCount: number;
    pausedCount: number;
    completedCount: number;
    totalGenerated: number;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [frequencyFilter, setFrequencyFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  useDocumentTitle("Sales · Recurring Invoices");

  const [upcoming, setUpcoming] = useState<
    { templateName: string; contactName: string; lineTotal: number; dates: { date: string; occurrence: number }[] }[]
  >([]);

  const PAGE_SIZE = 50;
  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const columns = useMemo(() => buildColumns(), []);

  const buildParams = useCallback((p: number) => {
    const params = new URLSearchParams();
    params.set("type", "invoice");
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (frequencyFilter !== "all") params.set("frequency", frequencyFilter);
    if (sortBy !== "created") params.set("sortBy", sortBy);
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    params.set("page", String(p));
    params.set("limit", String(PAGE_SIZE));
    return params;
  }, [statusFilter, frequencyFilter, sortBy, sortOrder]);

  // Fetch first page when filters change
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRefetching(true);
    setPage(1);

    fetch(`/api/v1/recurring?${buildParams(1)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const items = data.data || [];
        setTemplates(items);
        setTotalCount(data.pagination?.total || 0);

        // Load previews for active templates
        const active = (items as RecurringTemplate[]).filter((t) => t.status === "active");
        if (active.length > 0) {
          Promise.all(
            active.slice(0, 5).map((t) =>
              fetch(`/api/v1/recurring/${t.id}/preview?count=3`, {
                headers: { "x-organization-id": orgId },
              })
                .then((r) => r.json())
                .then((d) => ({
                  templateName: d.template?.name || t.name,
                  contactName: d.template?.contactName || t.contact?.name || "",
                  lineTotal: d.template?.lineTotal || 0,
                  dates: d.upcoming || [],
                }))
                .catch(() => null)
            )
          ).then((results) => {
            if (!cancelled) {
              setUpcoming(results.filter((r): r is NonNullable<typeof r> => r !== null && r.dates.length > 0));
            }
          });
        } else {
          setUpcoming([]);
        }
      })
      .then(() => devDelay())
      .finally(() => { if (!cancelled) { setInitialLoad(false); setRefetching(false); setFetchKey((k) => k + 1); } });

    return () => { cancelled = true; };
  }, [orgId, buildParams]);

  // Load more
  const loadMore = useCallback(() => {
    if (!orgId || loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);

    fetch(`/api/v1/recurring?${buildParams(nextPage)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setTemplates((prev) => [...prev, ...data.data]);
          setPage(nextPage);
        }
      })
      .finally(() => setLoadingMore(false));
  }, [orgId, page, buildParams, loadingMore]);

  const hasMore = templates.length < totalCount;
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !refetching) loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, refetching]);

  // Fetch summary stats (independent of filters)
  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/recurring/summary`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => setSummary(data));
  }, [orgId]);

  const handleSort = useCallback((key: string) => {
    setSortBy((prev) => {
      if (prev === key) {
        setSortOrder((o) => (o === "desc" ? "asc" : "desc"));
        return key;
      }
      setSortOrder("desc");
      return key;
    });
  }, []);

  const hasFilters = search || frequencyFilter !== "all";
  const pendingSearch = search !== debouncedSearch;

  const [searchKey, setSearchKey] = useState(0);
  const filteredTemplates = useMemo(() => {
    if (!debouncedSearch) return templates;
    const q = debouncedSearch.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.contact?.name || "").toLowerCase().includes(q)
    );
  }, [templates, debouncedSearch]);

  // Bump searchKey when debounced search changes to trigger ContentReveal
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchKey((k) => k + 1);
  }, [debouncedSearch]);

  const activeCount = summary?.activeCount || 0;
  const pausedCount = summary?.pausedCount || 0;
  const totalGenerated = summary?.totalGenerated || 0;

  if (initialLoad) return <BrandLoader />;

  if (!initialLoad && !refetching && templates.length === 0 && statusFilter === "all" && !hasFilters) {
    // Generate a sample month grid
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const startDay = monthStart.getDay(); // 0=Sun
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const monthName = monthStart.toLocaleString("en-US", { month: "long", year: "numeric" });
    // Highlight the 1st and 15th as "recurring" dates
    const recurringDays = new Set([1, 15]);

    return (
      <ContentReveal>
        <div className="pt-12 pb-12 space-y-10">
          {/* Top: title + CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Recurring Invoices</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Set up templates that automatically generate invoices on a schedule.
              </p>
            </div>
            <Button
              onClick={() => openDrawer("recurring")}
              className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            >
              <Plus className="mr-2 size-4" />
              New Recurring Template
            </Button>
          </div>

          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
            {/* Left: Calendar */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                <p className="text-sm font-medium">{monthName}</p>
                <RefreshCw className="size-3.5 text-indigo-500" />
              </div>
              <div className="p-3">
                <div className="grid grid-cols-7 mb-1">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                    <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {Array.from({ length: startDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-8" />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const isRecurring = recurringDays.has(day);
                    const isToday = day === today.getDate();
                    return (
                      <div key={day} className="flex items-center justify-center h-8">
                        <div className={`flex size-7 items-center justify-center rounded-full text-xs
                          ${isRecurring ? "bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold ring-2 ring-indigo-300/50 dark:ring-indigo-700/50" : ""}
                          ${isToday && !isRecurring ? "bg-muted font-medium" : ""}
                          ${!isRecurring && !isToday ? "text-muted-foreground" : ""}
                        `}>
                          {day}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t">
                  <div className="size-2.5 rounded-full bg-indigo-400 dark:bg-indigo-500" />
                  <span className="text-[10px] text-muted-foreground">Invoice auto-generates on these dates</span>
                </div>
              </div>
            </div>

            {/* Right: Mock template + frequency options */}
            <div className="space-y-4">
              {/* Mock template card */}
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Example template</p>
                </div>
                <div className="p-3 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Monthly hosting</p>
                      <p className="text-xs text-muted-foreground">Acme Corp</p>
                    </div>
                    <span className="rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">active</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Frequency</p>
                      <p className="font-medium mt-0.5">Monthly</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Amount</p>
                      <p className="font-medium font-mono mt-0.5">$299.00</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Next invoice</p>
                      <p className="font-medium mt-0.5">Apr 1, 2026</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Generated</p>
                      <p className="font-medium font-mono mt-0.5">12 / &infin;</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Supported frequencies */}
              <div className="rounded-xl border bg-card px-3 sm:px-5 py-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Supported frequencies</p>
                <div className="flex flex-wrap gap-2">
                  {["Weekly", "Fortnightly", "Monthly", "Quarterly", "Semi-annual", "Annual"].map((freq) => (
                    <span key={freq} className="rounded-full border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">{freq}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      {/* Top: Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Active Templates" value={activeCount.toString()} icon={RefreshCw} />
        <StatCard title="Paused" value={pausedCount.toString()} icon={RefreshCw} changeType="negative" />
        <StatCard title="Total Generated" value={totalGenerated.toString()} icon={RefreshCw} />
      </div>

      {/* Upcoming Generations */}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Upcoming Generations</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {upcoming.map((u) => (
              <div key={u.templateName} className="rounded-lg border px-4 py-3 min-w-[220px] shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.templateName}</p>
                    {u.contactName && (
                      <p className="text-xs text-muted-foreground truncate">{u.contactName}</p>
                    )}
                  </div>
                  <p className="text-sm font-mono font-semibold tabular-nums shrink-0 ml-2">{formatMoney(u.lineTotal)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {u.dates.map((d) => (
                    <div key={d.date} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="size-3" />
                      <span>{d.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="h-px bg-border" />

      {/* Template table */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="overflow-x-auto">
              <TabsTrigger value="all" className="whitespace-nowrap">All</TabsTrigger>
              <TabsTrigger value="active" className="whitespace-nowrap">Active</TabsTrigger>
              <TabsTrigger value="paused" className="whitespace-nowrap">Paused</TabsTrigger>
              <TabsTrigger value="completed" className="whitespace-nowrap">Completed</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            onClick={() => openDrawer("recurring")}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New Recurring
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-56 pl-8 text-xs"
            />
          </div>
          <Select
            value={frequencyFilter}
            onValueChange={setFrequencyFilter}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Frequency..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Frequencies</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="fortnightly">Fortnightly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="semi_annual">Semi-Annual</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={`${sortBy}:${sortOrder}`}
            onValueChange={(v) => {
              const [key, order] = v.split(":");
              setSortBy(key);
              setSortOrder(order as "asc" | "desc");
            }}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created:desc">Newest</SelectItem>
              <SelectItem value="created:asc">Oldest</SelectItem>
              <SelectItem value="name:asc">Name A-Z</SelectItem>
              <SelectItem value="name:desc">Name Z-A</SelectItem>
              <SelectItem value="nextRun:asc">Next run soonest</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => { setSearch(""); setFrequencyFilter("all"); }}
            >
              <X className="mr-1 size-3" />
              Clear filters
            </Button>
          )}
        </div>

        {refetching || pendingSearch ? (
          <BrandLoader className="h-48" />
        ) : (
          <ContentReveal key={`${fetchKey}-${searchKey}`}>
            <DataTable
              columns={columns}
              data={filteredTemplates}
              loading={false}
              emptyMessage="No recurring invoices match your filters."
              onRowClick={(r) => router.push(`/sales/recurring/${r.id}`)}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
            />
          </ContentReveal>
        )}

        {/* Infinite scroll sentinel & count */}
        {!refetching && !pendingSearch && filteredTemplates.length > 0 && (
          <>
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Showing {templates.length} of {totalCount} template{totalCount !== 1 ? "s" : ""}
              </p>
            </div>
            {hasMore && (
              <div ref={sentinelRef} className="flex justify-center py-4">
                {loadingMore && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              </div>
            )}
          </>
        )}
      </div>
    </ContentReveal>
  );
}

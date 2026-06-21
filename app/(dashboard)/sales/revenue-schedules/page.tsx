"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useRouter } from "next/navigation";
import { Plus, CalendarClock, TrendingUp, X, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";

interface RevenueScheduleEntry {
  id: string;
  recognized: boolean;
}

interface RevenueSchedule {
  id: string;
  totalAmount: number;
  recognizedAmount: number;
  startDate: string;
  endDate: string;
  method: string;
  status: string;
  entries?: RevenueScheduleEntry[];
}

const statusColors: Record<string, string> = {
  active: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

// Plain-language status labels (end users aren't accountants).
const statusLabels: Record<string, string> = {
  active: "in progress",
  completed: "finished",
  cancelled: "cancelled",
};

// Plain-language method labels (end users aren't accountants).
const methodLabels: Record<string, string> = {
  straight_line: "evenly over time",
  milestone: "by milestone",
  on_completion: "when finished",
};

function buildColumns(): Column<RevenueSchedule>[] {
  return [
    {
      key: "period",
      header: "Period",
      render: (r) => (
        <span className="text-sm">
          {r.startDate} &ndash; {r.endDate}
        </span>
      ),
    },
    {
      key: "method",
      header: "How it's spread",
      className: "w-40",
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {methodLabels[r.method] || r.method}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "w-28",
      render: (r) => (
        <Badge variant="outline" className={statusColors[r.status] || ""}>
          {statusLabels[r.status] || r.status}
        </Badge>
      ),
    },
    {
      key: "total",
      header: "Total",
      className: "w-28 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {formatMoney(r.totalAmount)}
        </span>
      ),
    },
    {
      key: "recognized",
      header: "Counted so far",
      className: "w-32 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums text-emerald-600">
          {formatMoney(r.recognizedAmount)}
        </span>
      ),
    },
    {
      key: "remaining",
      header: "Left to count",
      className: "w-32 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums text-amber-600">
          {formatMoney(r.totalAmount - r.recognizedAmount)}
        </span>
      ),
    },
  ];
}

export default function RevenueSchedulesPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [schedules, setSchedules] = useState<RevenueSchedule[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [fetchKey, setFetchKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  useDocumentTitle("Sales · Revenue Schedules");

  const PAGE_SIZE = 50;
  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const columns = useMemo(() => buildColumns(), []);

  const buildParams = useCallback((p: number) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    params.set("limit", String(PAGE_SIZE));
    return params;
  }, []);

  // Fetch first page when filters change
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRefetching(true);
    setPage(1);

    fetch(`/api/v1/revenue-schedules?${buildParams(1)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setSchedules(data.data || []);
        setTotalCount(data.pagination?.total || 0);
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

    fetch(`/api/v1/revenue-schedules?${buildParams(nextPage)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setSchedules((prev) => [...prev, ...data.data]);
          setPage(nextPage);
        }
      })
      .finally(() => setLoadingMore(false));
  }, [orgId, page, buildParams, loadingMore]);

  const hasMore = schedules.length < totalCount;
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

  const hasFilters = !!search;
  const pendingSearch = search !== debouncedSearch;

  const [searchKey, setSearchKey] = useState(0);
  const filteredSchedules = useMemo(() => {
    let list = schedules;
    if (statusFilter !== "all") {
      list = list.filter((s) => s.status === statusFilter);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (s) =>
          s.startDate.toLowerCase().includes(q) ||
          s.endDate.toLowerCase().includes(q) ||
          (methodLabels[s.method] || s.method).toLowerCase().includes(q)
      );
    }
    return list;
  }, [schedules, statusFilter, debouncedSearch]);

  // Bump searchKey when debounced search or status filter changes to trigger ContentReveal
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchKey((k) => k + 1);
  }, [debouncedSearch, statusFilter]);

  const totalScheduled = useMemo(
    () => schedules.reduce((sum, s) => sum + (s.status !== "cancelled" ? s.totalAmount : 0), 0),
    [schedules]
  );
  const totalRecognized = useMemo(
    () => schedules.reduce((sum, s) => sum + (s.status !== "cancelled" ? s.recognizedAmount : 0), 0),
    [schedules]
  );
  const totalRemaining = totalScheduled - totalRecognized;

  if (initialLoad) return <BrandLoader />;

  if (!initialLoad && !refetching && schedules.length === 0 && statusFilter === "all" && !hasFilters) {
    return (
      <ContentReveal>
        <div className="pt-12 pb-12 space-y-10">
          {/* Top: title + CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Revenue Schedules</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Count income from an invoice gradually over time instead of all at once — useful for upfront payments you earn month by month.
              </p>
            </div>
            <Button
              onClick={() => openDrawer("revenueSchedule")}
              className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            >
              <Plus className="mr-2 size-4" />
              New schedule
            </Button>
          </div>

          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
            {/* Left: how it works */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How a schedule works</p>
              </div>
              <div className="divide-y">
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                      <CalendarClock className="size-3.5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Paid upfront</p>
                      <p className="text-[11px] text-muted-foreground">INV-0042 · 12 months</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium">$1,200.00</span>
                </div>
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 bg-emerald-50/30 dark:bg-emerald-950/10">
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-950/40">
                      <TrendingUp className="size-3.5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Counted each month</p>
                      <p className="text-[11px] text-muted-foreground">Spread evenly</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">+$100.00</span>
                </div>
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="size-7" />
                    <p className="text-sm font-semibold">After 12 months</p>
                  </div>
                  <span className="font-mono text-sm font-bold">$1,200.00</span>
                </div>
              </div>
            </div>

            {/* Right: Use cases */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">When to use</p>
              {[
                {
                  title: "Annual subscription paid upfront",
                  desc: "Customer pays for a full year at once? Count the income one month at a time.",
                  color: "border-l-blue-400",
                },
                {
                  title: "Prepaid retainer or support plan",
                  desc: "Got paid in advance for ongoing work? Spread the income across the term.",
                  color: "border-l-amber-400",
                },
                {
                  title: "Deposits for future delivery",
                  desc: "Took a payment before the work is done? Recognise it as you deliver.",
                  color: "border-l-teal-400",
                },
                {
                  title: "Multi-month projects",
                  desc: "Billed once for a long project? Recognise the income as you progress.",
                  color: "border-l-purple-400",
                },
              ].map(({ title, desc, color }) => (
                <div key={title} className={`rounded-lg border border-l-[3px] ${color} bg-card px-4 py-3`}>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
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
      {/* Top: Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Total scheduled" value={formatMoney(totalScheduled)} icon={CalendarClock} />
        <StatCard title="Counted so far" value={formatMoney(totalRecognized)} icon={TrendingUp} />
        <StatCard title="Left to count" value={formatMoney(totalRemaining)} icon={CalendarClock} />
      </div>

      <div className="h-px bg-border" />

      {/* Revenue schedule table */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="overflow-x-auto">
              <TabsTrigger value="all" className="whitespace-nowrap">All</TabsTrigger>
              <TabsTrigger value="active" className="whitespace-nowrap" title="Schedules still counting income over time">In progress</TabsTrigger>
              <TabsTrigger value="completed" className="whitespace-nowrap" title="Schedules where all the income has been counted">Finished</TabsTrigger>
              <TabsTrigger value="cancelled" className="whitespace-nowrap">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            onClick={() => openDrawer("revenueSchedule")}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New schedule
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search schedules..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-56 pl-8 text-xs"
            />
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => { setSearch(""); }}
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
              data={filteredSchedules}
              loading={false}
              emptyMessage="No revenue schedules match your filters."
              onRowClick={(r) => router.push(`/sales/revenue-schedules/${r.id}`)}
            />
          </ContentReveal>
        )}

        {/* Infinite scroll sentinel & count */}
        {!refetching && !pendingSearch && filteredSchedules.length > 0 && (
          <>
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Showing {schedules.length} of {totalCount} schedule{totalCount !== 1 ? "s" : ""}
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

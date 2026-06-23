"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useRouter } from "next/navigation";
import { Plus, CalendarRange, CalendarClock, X, Search, Loader2 } from "lucide-react";
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

interface AccrualEntry {
  id: string;
  periodDate: string;
  amount: number;
  posted: boolean;
  journalEntryId: string | null;
}

interface AccrualSchedule {
  id: string;
  description: string;
  totalAmount: number;
  startDate: string;
  endDate: string;
  periods: number;
  status: string;
  entries: AccrualEntry[];
}

const statusColors: Record<string, string> = {
  active: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

// Plain-language status labels (end users aren't accountants).
const statusLabels: Record<string, string> = {
  active: "running",
  completed: "finished",
  cancelled: "cancelled",
};

function buildColumns(): Column<AccrualSchedule>[] {
  return [
    {
      key: "description",
      header: "What it's for",
      render: (r) => (
        <span className="text-sm font-medium">{r.description}</span>
      ),
    },
    {
      key: "total",
      header: "Total",
      sortKey: "total",
      className: "w-28 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {formatMoney(r.totalAmount)}
        </span>
      ),
    },
    {
      key: "periods",
      header: "Months",
      className: "w-24 text-right",
      render: (r) => (
        <span className="text-sm tabular-nums">{r.periods}</span>
      ),
    },
    {
      key: "start",
      header: "Starts",
      sortKey: "start",
      className: "w-28",
      render: (r) => <span className="text-sm">{r.startDate}</span>,
    },
    {
      key: "status",
      header: "Status",
      className: "w-24",
      render: (r) => (
        <Badge variant="outline" className={statusColors[r.status] || ""}>
          {statusLabels[r.status] || r.status}
        </Badge>
      ),
    },
  ];
}

export default function AccrualsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [schedules, setSchedules] = useState<AccrualSchedule[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [fetchKey, setFetchKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  useDocumentTitle("Accounting · Accruals");

  const PAGE_SIZE = 50;
  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const columns = useMemo(() => buildColumns(), []);

  const buildParams = useCallback((p: number) => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("page", String(p));
    params.set("limit", String(PAGE_SIZE));
    return params;
  }, [statusFilter]);

  // Fetch first page when filters change
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRefetching(true);
    setPage(1);

    fetch(`/api/v1/accrual-schedules?${buildParams(1)}`, {
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

    fetch(`/api/v1/accrual-schedules?${buildParams(nextPage)}`, {
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
    if (!debouncedSearch) return schedules;
    const q = debouncedSearch.toLowerCase();
    return schedules.filter((s) => s.description.toLowerCase().includes(q));
  }, [schedules, debouncedSearch]);

  // Bump searchKey when debounced search changes to trigger ContentReveal
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchKey((k) => k + 1);
  }, [debouncedSearch]);

  const totalScheduled = useMemo(
    () => schedules.reduce((sum, s) => sum + (s.status !== "cancelled" ? s.totalAmount : 0), 0),
    [schedules]
  );
  const runningCount = useMemo(
    () => schedules.filter((s) => s.status === "active").length,
    [schedules]
  );

  if (initialLoad) return <BrandLoader />;

  if (!initialLoad && !refetching && schedules.length === 0 && statusFilter === "all" && !hasFilters) {
    return (
      <ContentReveal>
        <div className="pt-12 pb-12 space-y-10">
          {/* Top: title + CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Accruals</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Spread a one-off cost or income evenly over several months, instead of putting it all in one month.
              </p>
            </div>
            <Button
              onClick={() => openDrawer("accrualSchedule")}
              className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            >
              <Plus className="mr-2 size-4" />
              New accrual
            </Button>
          </div>

          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
            {/* Left: how it works */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How an accrual works</p>
              </div>
              <div className="divide-y">
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                      <CalendarRange className="size-3.5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">One-off cost</p>
                      <p className="text-[11px] text-muted-foreground">Annual insurance</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium">$1,200.00</span>
                </div>
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 bg-teal-50/30 dark:bg-teal-950/10">
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-md bg-teal-50 dark:bg-teal-950/40">
                      <CalendarClock className="size-3.5 text-teal-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-teal-700 dark:text-teal-300">Spread over 12 months</p>
                      <p className="text-[11px] text-muted-foreground">A little each month</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium text-teal-600 dark:text-teal-400">$100.00/mo</span>
                </div>
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="size-7" />
                    <p className="text-sm font-semibold">Each month shows its fair share</p>
                  </div>
                  <span className="font-mono text-sm font-bold">$100.00</span>
                </div>
              </div>
            </div>

            {/* Right: Use cases */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">When to use</p>
              {[
                {
                  title: "Paid a year upfront",
                  desc: "Insurance, rent, or a subscription billed annually? Spread the cost across the months it covers.",
                  color: "border-l-blue-400",
                },
                {
                  title: "Big bill, many months",
                  desc: "A one-off expense that really benefits a whole year shouldn't land in a single month.",
                  color: "border-l-amber-400",
                },
                {
                  title: "Income earned over time",
                  desc: "Got paid upfront for work delivered over several months? Recognise it bit by bit.",
                  color: "border-l-teal-400",
                },
                {
                  title: "Smoother monthly numbers",
                  desc: "Even out lumpy costs so each month's profit reflects what actually happened.",
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
        <StatCard title="Scheduled" value={formatMoney(totalScheduled)} icon={CalendarRange} />
        <StatCard title="Running" value={runningCount.toString()} icon={CalendarClock} />
      </div>

      <div className="h-px bg-border" />

      {/* Accrual table */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="overflow-x-auto">
              <TabsTrigger value="all" className="whitespace-nowrap">All</TabsTrigger>
              <TabsTrigger value="active" className="whitespace-nowrap">Running</TabsTrigger>
              <TabsTrigger value="completed" className="whitespace-nowrap">Finished</TabsTrigger>
              <TabsTrigger value="cancelled" className="whitespace-nowrap">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            onClick={() => openDrawer("accrualSchedule")}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New accrual
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search accruals..."
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
              emptyMessage="No accruals match your filters."
              onRowClick={(r) => router.push(`/accounting/accruals/${r.id}`)}
            />
          </ContentReveal>
        )}

        {/* Infinite scroll sentinel & count */}
        {!refetching && !pendingSearch && filteredSchedules.length > 0 && (
          <>
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Showing {schedules.length} of {totalCount} accrual{totalCount !== 1 ? "s" : ""}
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

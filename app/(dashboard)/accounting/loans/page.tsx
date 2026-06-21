"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useRouter } from "next/navigation";
import { Plus, Landmark, Wallet, X, Search, Loader2 } from "lucide-react";
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

interface Loan {
  id: string;
  name: string;
  principalAmount: number;
  interestRate: number;
  termMonths: number;
  startDate: string;
  monthlyPayment: number;
  status: string;
}

const statusColors: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  paid_off: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  defaulted: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

// Plain-language status labels (end users aren't accountants).
const statusLabels: Record<string, string> = {
  active: "active",
  paid_off: "paid off",
  defaulted: "defaulted",
};

function buildColumns(): Column<Loan>[] {
  return [
    {
      key: "name",
      header: "Name",
      render: (r) => (
        <span className="text-sm font-medium">{r.name}</span>
      ),
    },
    {
      key: "principal",
      header: "Amount borrowed",
      className: "w-36 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {formatMoney(r.principalAmount)}
        </span>
      ),
    },
    {
      key: "rate",
      header: "Interest rate",
      className: "w-28 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {(r.interestRate / 100).toFixed(2)}%
        </span>
      ),
    },
    {
      key: "monthlyPayment",
      header: "Monthly payment",
      className: "w-36 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {formatMoney(r.monthlyPayment)}
        </span>
      ),
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

export default function LoansPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [fetchKey, setFetchKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  useDocumentTitle("Accounting · Loans");

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

    fetch(`/api/v1/loans?${buildParams(1)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setLoans(data.data || []);
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

    fetch(`/api/v1/loans?${buildParams(nextPage)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setLoans((prev) => [...prev, ...data.data]);
          setPage(nextPage);
        }
      })
      .finally(() => setLoadingMore(false));
  }, [orgId, page, buildParams, loadingMore]);

  const hasMore = loans.length < totalCount;
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
  const filteredLoans = useMemo(() => {
    if (!debouncedSearch) return loans;
    const q = debouncedSearch.toLowerCase();
    return loans.filter((l) => l.name.toLowerCase().includes(q));
  }, [loans, debouncedSearch]);

  // Bump searchKey when debounced search changes to trigger ContentReveal
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchKey((k) => k + 1);
  }, [debouncedSearch]);

  const totalBorrowed = useMemo(
    () => loans.reduce((sum, l) => sum + (l.status === "active" ? l.principalAmount : 0), 0),
    [loans]
  );
  const totalMonthly = useMemo(
    () => loans.reduce((sum, l) => sum + (l.status === "active" ? l.monthlyPayment : 0), 0),
    [loans]
  );

  if (initialLoad) return <BrandLoader />;

  if (!initialLoad && !refetching && loans.length === 0 && statusFilter === "all" && !hasFilters) {
    return (
      <ContentReveal>
        <div className="pt-12 pb-12 space-y-10">
          {/* Top: title + CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Loans</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Track money you&apos;ve borrowed, see how each monthly payment splits between the loan and interest, and record payments as you make them.
              </p>
            </div>
            <Button
              onClick={() => openDrawer("loan")}
              className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            >
              <Plus className="mr-2 size-4" />
              New loan
            </Button>
          </div>

          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
            {/* Left: how it works */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How a loan works</p>
              </div>
              <div className="divide-y">
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                      <Landmark className="size-3.5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Amount borrowed</p>
                      <p className="text-[11px] text-muted-foreground">Equipment loan</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium">$10,000.00</span>
                </div>
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 bg-emerald-50/30 dark:bg-emerald-950/10">
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-950/40">
                      <Wallet className="size-3.5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Monthly payment</p>
                      <p className="text-[11px] text-muted-foreground">Part loan, part interest</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">-$880.00</span>
                </div>
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="size-7" />
                    <p className="text-sm font-semibold">Paid off over time</p>
                  </div>
                  <span className="font-mono text-sm font-bold">$0.00</span>
                </div>
              </div>
            </div>

            {/* Right: Use cases */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">When to use</p>
              {[
                {
                  title: "Bank or business loan",
                  desc: "Borrowed a lump sum you repay in fixed monthly instalments.",
                  color: "border-l-blue-400",
                },
                {
                  title: "Equipment or vehicle finance",
                  desc: "Financed a big purchase? Track what you still owe and each payment.",
                  color: "border-l-emerald-400",
                },
                {
                  title: "See the interest you pay",
                  desc: "Every payment is split for you between the loan itself and interest.",
                  color: "border-l-amber-400",
                },
                {
                  title: "Keep your books accurate",
                  desc: "Record each payment so your loan balance always matches reality.",
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
        <StatCard title="Currently borrowed" value={formatMoney(totalBorrowed)} icon={Landmark} />
        <StatCard title="Monthly payments" value={formatMoney(totalMonthly)} icon={Wallet} />
        <StatCard title="Loans" value={totalCount.toString()} icon={Landmark} />
      </div>

      <div className="h-px bg-border" />

      {/* Loans table */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="overflow-x-auto">
              <TabsTrigger value="all" className="whitespace-nowrap">All</TabsTrigger>
              <TabsTrigger value="active" className="whitespace-nowrap">Active</TabsTrigger>
              <TabsTrigger value="paid_off" className="whitespace-nowrap">Paid off</TabsTrigger>
              <TabsTrigger value="defaulted" className="whitespace-nowrap">Defaulted</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            onClick={() => openDrawer("loan")}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New loan
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search loans..."
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
              data={filteredLoans}
              loading={false}
              emptyMessage="No loans match your filters."
              onRowClick={(r) => router.push(`/accounting/loans/${r.id}`)}
            />
          </ContentReveal>
        )}

        {/* Infinite scroll sentinel & count */}
        {!refetching && !pendingSearch && filteredLoans.length > 0 && (
          <>
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Showing {loans.length} of {totalCount} loan{totalCount !== 1 ? "s" : ""}
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

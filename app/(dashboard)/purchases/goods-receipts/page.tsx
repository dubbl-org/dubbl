"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useRouter } from "next/navigation";
import { PackageCheck, Truck, X, Search, Loader2, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import Link from "next/link";

interface GoodsReceiptLine {
  quantityReceived: number;
  unitCost: number;
}

interface GoodsReceipt {
  id: string;
  receiptNumber: string;
  date: string;
  status: string;
  contact: { name: string } | null;
  lines?: GoodsReceiptLine[];
}

const statusColors: Record<string, string> = {
  draft: "",
  received:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  billed:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

// Plain-language status labels (end users aren't accountants).
const statusLabels: Record<string, string> = {
  draft: "draft",
  received: "received",
  billed: "billed",
  void: "cancelled",
};

// Total value of goods received: sum of (qty received / 100) * unit cost per line.
function receivedValue(r: GoodsReceipt): number {
  if (!r.lines) return 0;
  return r.lines.reduce((sum, l) => sum + (l.quantityReceived / 100) * l.unitCost, 0);
}

function buildColumns(): Column<GoodsReceipt>[] {
  return [
    {
      key: "number",
      header: "Number",
      sortKey: "number",
      className: "w-32",
      render: (r) => (
        <span className="font-mono text-sm">{r.receiptNumber}</span>
      ),
    },
    {
      key: "contact",
      header: "Supplier",
      render: (r) => (
        <span className="text-sm font-medium">{r.contact?.name || "-"}</span>
      ),
    },
    {
      key: "date",
      header: "Date",
      sortKey: "date",
      className: "w-28",
      render: (r) => <span className="text-sm">{r.date}</span>,
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
    {
      key: "value",
      header: "Value received",
      className: "w-32 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {r.lines ? formatMoney(Math.round(receivedValue(r))) : "-"}
        </span>
      ),
    },
  ];
}

export default function GoodsReceiptsPage() {
  const router = useRouter();
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [fetchKey, setFetchKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  useDocumentTitle("Purchases · Goods Received");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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

    fetch(`/api/v1/goods-receipts?${buildParams(1)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setReceipts(data.data || []);
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

    fetch(`/api/v1/goods-receipts?${buildParams(nextPage)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setReceipts((prev) => [...prev, ...data.data]);
          setPage(nextPage);
        }
      })
      .finally(() => setLoadingMore(false));
  }, [orgId, page, buildParams, loadingMore]);

  const hasMore = receipts.length < totalCount;
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

  const hasFilters = search || dateFrom || dateTo;
  const pendingSearch = search !== debouncedSearch;

  const [searchKey, setSearchKey] = useState(0);
  const filteredReceipts = useMemo(() => {
    let rows = receipts;
    if (dateFrom) rows = rows.filter((r) => r.date >= dateFrom);
    if (dateTo) rows = rows.filter((r) => r.date <= dateTo);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.receiptNumber.toLowerCase().includes(q) ||
          (r.contact?.name || "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [receipts, debouncedSearch, dateFrom, dateTo]);

  // Bump searchKey when debounced search changes to trigger ContentReveal
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchKey((k) => k + 1);
  }, [debouncedSearch]);

  const totalValue = useMemo(
    () => receipts.reduce((sum, r) => sum + (r.status !== "void" ? receivedValue(r) : 0), 0),
    [receipts]
  );

  if (initialLoad) return <BrandLoader />;

  if (!initialLoad && !refetching && receipts.length === 0 && statusFilter === "all" && !hasFilters) {
    return (
      <ContentReveal>
        <div className="pt-12 pb-12 space-y-10">
          {/* Top: title + hint (no "new" — goods are received from a purchase order) */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Goods Received</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                The stock you&apos;ve received from suppliers against a purchase order. Record what arrived so your inventory stays accurate.
              </p>
            </div>
            <Button variant="outline" asChild className="shrink-0">
              <Link href="/purchases/orders">
                Go to purchase orders
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
            {/* Left: how it works */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How receiving goods works</p>
              </div>
              <div className="divide-y">
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                      <Truck className="size-3.5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Order placed</p>
                      <p className="text-[11px] text-muted-foreground">PO-0042</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium">$1,200.00</span>
                </div>
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 bg-emerald-50/30 dark:bg-emerald-950/10">
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-950/40">
                      <PackageCheck className="size-3.5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Goods received</p>
                      <p className="text-[11px] text-muted-foreground">GRN-0001</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">+$1,200.00</span>
                </div>
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="size-7" />
                    <p className="text-sm font-semibold">Stock on hand</p>
                  </div>
                  <span className="font-mono text-sm font-bold">Updated</span>
                </div>
              </div>
            </div>

            {/* Right: how to record one */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How to record goods you&apos;ve received</p>
              {[
                {
                  title: "Open the purchase order",
                  desc: "Goods are always received against an order you sent to a supplier — start there.",
                  color: "border-l-blue-400",
                },
                {
                  title: "Mark what arrived",
                  desc: "Enter the quantity received for each item — receive it all at once or in part deliveries.",
                  color: "border-l-emerald-400",
                },
                {
                  title: "Stock updates automatically",
                  desc: "Received items are added to your inventory on hand straight away.",
                  color: "border-l-amber-400",
                },
                {
                  title: "Bill it later",
                  desc: "When the supplier's invoice arrives, create a bill from the same order.",
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
        <StatCard title="Value received" value={formatMoney(Math.round(totalValue))} icon={PackageCheck} />
        <StatCard title="Receipts" value={totalCount.toString()} icon={Truck} />
      </div>

      <div className="h-px bg-border" />

      {/* Goods receipt table */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="overflow-x-auto">
              <TabsTrigger value="all" className="whitespace-nowrap">All</TabsTrigger>
              <TabsTrigger value="received" className="whitespace-nowrap">Received</TabsTrigger>
              <TabsTrigger value="billed" className="whitespace-nowrap" title="Goods you've received and have since been billed for">Billed</TabsTrigger>
              <TabsTrigger value="void" className="whitespace-nowrap">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Goods are received from a purchase order — no "new" here. */}
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Truck className="size-3.5 shrink-0" />
            Received from a{" "}
            <Link href="/purchases/orders" className="underline underline-offset-2 hover:text-foreground">
              purchase order
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search goods received..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-56 pl-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">From</span>
            <DatePicker
              value={dateFrom}
              onChange={(v) => setDateFrom(v)}
              placeholder="Start date"
              className="h-8 w-40 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">To</span>
            <DatePicker
              value={dateTo}
              onChange={(v) => setDateTo(v)}
              placeholder="End date"
              className="h-8 w-40 text-xs"
            />
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }}
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
              data={filteredReceipts}
              loading={false}
              emptyMessage="No goods received match your filters."
              onRowClick={(r) => router.push(`/purchases/goods-receipts/${r.id}`)}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
            />
          </ContentReveal>
        )}

        {/* Infinite scroll sentinel & count */}
        {!refetching && !pendingSearch && filteredReceipts.length > 0 && (
          <>
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Showing {receipts.length} of {totalCount} receipt{totalCount !== 1 ? "s" : ""}
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

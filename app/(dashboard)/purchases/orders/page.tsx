"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  ClipboardList,
  Search,
  X,
  Package,
  Truck,
  Loader2,
} from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { motion, MotionConfig } from "motion/react";

interface PO {
  id: string;
  poNumber: string;
  issueDate: string;
  deliveryDate: string | null;
  status: string;
  total: number;
  contact: { name: string } | null;
}

const statusColors: Record<string, string> = {
  draft: "",
  sent: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  partial:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  received:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  closed:
    "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
  void: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

function buildColumns(): Column<PO>[] {
  return [
    {
      key: "number",
      header: "Number",
      sortKey: "number",
      className: "w-32",
      render: (r) => <span className="font-mono text-sm">{r.poNumber}</span>,
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
      render: (r) => <span className="text-sm">{r.issueDate}</span>,
    },
    {
      key: "delivery",
      header: "Delivery",
      className: "w-28",
      render: (r) => <span className="text-sm">{r.deliveryDate || "-"}</span>,
    },
    {
      key: "status",
      header: "Status",
      className: "w-24",
      render: (r) => (
        <Badge variant="outline" className={statusColors[r.status] || ""}>
          {r.status}
        </Badge>
      ),
    },
    {
      key: "total",
      header: "Total",
      sortKey: "total",
      className: "w-28 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {formatMoney(r.total)}
        </span>
      ),
    },
  ];
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [pos, setPos] = useState<PO[]>([]);
  const [countsData, setCountsData] = useState<{ counts: Record<string, { count: number; amount: number }>; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("created");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fetchKey, setFetchKey] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
  const columns = useMemo(() => buildColumns(), []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback((pg: number) => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sortBy !== "created") params.set("sortBy", sortBy);
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    params.set("page", String(pg));
    params.set("limit", "50");
    return params;
  }, [statusFilter, debouncedSearch, sortBy, sortOrder, dateFrom, dateTo]);

  // Fetch status counts
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetch(`/api/v1/purchase-orders/counts`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.counts) setCountsData(data);
      });
    return () => { cancelled = true; };
  }, [orgId]);

  // Reset and fetch page 1 when filters change
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const isRefetch = !loading;

    setPage(1);
    setHasMore(true);
    if (isRefetch) setRefetching(true);

    fetch(`/api/v1/purchase-orders?${buildParams(1)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.data) setPos(data.data);
        if (data.pagination) {
          setHasMore(data.pagination.page < data.pagination.totalPages);
        }
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
  }, [orgId, statusFilter, debouncedSearch, sortBy, sortOrder, dateFrom, dateTo]);

  // Load next page
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !orgId) return;
    const nextPage = page + 1;
    setLoadingMore(true);

    fetch(`/api/v1/purchase-orders?${buildParams(nextPage)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setPos((prev) => [...prev, ...data.data]);
        if (data.pagination) {
          setPage(data.pagination.page);
          setHasMore(data.pagination.page < data.pagination.totalPages);
        }
      })
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, orgId, page, buildParams]);

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

  const pendingSearch = search !== debouncedSearch;
  const hasFilters = dateFrom || dateTo;

  const statusCounts = useMemo(() => {
    if (!countsData) return {} as Record<string, number>;
    const c: Record<string, number> = {};
    for (const [status, data] of Object.entries(countsData.counts)) {
      c[status] = data.count;
    }
    return c;
  }, [countsData]);

  const totalValue = useMemo(() => {
    if (!countsData) return 0;
    return Object.values(countsData.counts).reduce((s, d) => s + d.amount, 0);
  }, [countsData]);
  const activeValue = (countsData?.counts.sent?.amount || 0) + (countsData?.counts.partial?.amount || 0);
  const activeCount = (statusCounts.sent || 0) + (statusCounts.partial || 0);

  if (loading) return <BrandLoader />;

  if ((countsData?.total || 0) === 0 && statusFilter === "all" && !debouncedSearch && !hasFilters) {
    return (
      <ContentReveal>
        <div>
          {/* Full-width 3-step process */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 rounded-lg border overflow-hidden mb-8">
            {[
              {
                icon: ClipboardList,
                step: "1",
                label: "Create",
                desc: "Draft a purchase order with items, quantities, and pricing",
                color: "text-blue-600 dark:text-blue-400",
                bg: "bg-blue-50 dark:bg-blue-950/40",
                top: "bg-blue-500",
              },
              {
                icon: Truck,
                step: "2",
                label: "Send to Supplier",
                desc: "Send the PO directly to your supplier for fulfillment",
                color: "text-amber-600 dark:text-amber-400",
                bg: "bg-amber-50 dark:bg-amber-950/40",
                top: "bg-amber-500",
              },
              {
                icon: Package,
                step: "3",
                label: "Receive Goods",
                desc: "Mark items as received and track delivery against the order",
                color: "text-emerald-600 dark:text-emerald-400",
                bg: "bg-emerald-50 dark:bg-emerald-950/40",
                top: "bg-emerald-500",
              },
            ].map(({ icon: Icon, step, label, desc, color, bg, top }) => (
              <div key={step} className="relative flex flex-col items-center py-6 px-3 sm:py-8 sm:px-5 text-center border-b sm:border-b-0 border-r-0 sm:border-r last:border-b-0 sm:last:border-r-0">
                <div className={`absolute top-0 left-0 right-0 h-1 ${top} opacity-30`} />
                <div className={`flex size-11 items-center justify-center rounded-xl ${bg}`}>
                  <Icon className={`size-5 ${color}`} />
                </div>
                <p className="mt-3 text-sm font-semibold">{label}</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-[200px]">
                  {desc}
                </p>
              </div>
            ))}
          </div>

          {/* Skeleton card grid + CTA overlay */}
          <div className="relative">
            <div className="pointer-events-none grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-lg bg-muted" />
                    <div className="flex-1 space-y-1.5">
                      <div className={`h-2.5 rounded bg-muted ${i % 2 === 0 ? "w-20" : "w-24"}`} />
                      <div className={`h-2 rounded bg-muted/60 ${i % 2 === 0 ? "w-32" : "w-28"}`} />
                    </div>
                    <div className="h-2.5 w-16 rounded bg-muted/40" />
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-content-bg/10 via-content-bg/60 to-content-bg" />

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <h2 className="text-lg sm:text-xl font-semibold tracking-tight">
                No purchase orders yet
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
                Create purchase orders to track what you&apos;re buying from suppliers
                and when you expect delivery.
              </p>
              <Button
                onClick={() => openDrawer("purchaseOrder")}
                size="lg"
                className="mt-6 bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="mr-2 size-4" />
                New Purchase Order
              </Button>
            </div>
          </div>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal>
      <div className="space-y-3 sm:space-y-6">
        {/* Header */}
        <PageHeader
          title="Purchase Orders"
          description="Create and manage purchase orders for suppliers."
        >
          <Button
            size="sm"
            onClick={() => openDrawer("purchaseOrder")}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New PO
          </Button>
        </PageHeader>

        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total Value</p>
            <p className="text-lg sm:text-2xl font-bold font-mono tabular-nums tracking-tight">
              {formatMoney(totalValue)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-blue-500" />
              Active
            </p>
            <p className="text-lg sm:text-2xl font-bold font-mono tabular-nums tracking-tight text-blue-600 dark:text-blue-400">
              {formatMoney(activeValue)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Received
            </p>
            <p className="text-lg sm:text-2xl font-bold font-mono tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatMoney(countsData?.counts.received?.amount || 0)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Orders</p>
            <p className="text-lg sm:text-2xl font-bold tabular-nums tracking-tight">
              {countsData?.total || 0}
            </p>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Status tabs + search */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all" className="whitespace-nowrap">All ({countsData?.total || 0})</TabsTrigger>
                <TabsTrigger value="draft" className="whitespace-nowrap">Draft ({statusCounts.draft || 0})</TabsTrigger>
                <TabsTrigger value="sent" className="whitespace-nowrap">Sent ({statusCounts.sent || 0})</TabsTrigger>
                <TabsTrigger value="partial" className="whitespace-nowrap">Partial ({statusCounts.partial || 0})</TabsTrigger>
                <TabsTrigger value="received" className="whitespace-nowrap">Received ({statusCounts.received || 0})</TabsTrigger>
                <TabsTrigger value="closed" className="whitespace-nowrap">Closed ({statusCounts.closed || 0})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Date filters + sort */}
        <div className="flex flex-wrap items-center gap-2">
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
              <SelectItem value="created:desc">Newest first</SelectItem>
              <SelectItem value="created:asc">Oldest first</SelectItem>
              <SelectItem value="total:desc">Highest amount</SelectItem>
              <SelectItem value="total:asc">Lowest amount</SelectItem>
              <SelectItem value="number:asc">Number (A-Z)</SelectItem>
              <SelectItem value="number:desc">Number (Z-A)</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              <X className="mr-1 size-3" />
              Clear dates
            </Button>
          )}
        </div>

        {/* Table */}
        {refetching || pendingSearch ? (
          <BrandLoader className="h-40" />
        ) : (
          <MotionConfig reducedMotion="never">
            <motion.div
              key={fetchKey}
              initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                duration: 0.8,
                delay: 0.12,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{ willChange: "opacity, transform, filter" }}
            >
              <DataTable
                columns={columns}
                data={pos}
                loading={loading}
                emptyMessage="No purchase orders match your filters."
                onRowClick={(r) => router.push(`/purchases/orders/${r.id}`)}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
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
    </ContentReveal>
  );
}

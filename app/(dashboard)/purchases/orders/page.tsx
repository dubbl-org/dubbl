"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  ClipboardList,
  Search,
  Package,
  Truck,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { BlurReveal } from "@/components/ui/blur-reveal";
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

const columns: Column<PO>[] = [
  {
    key: "number",
    header: "Number",
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
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {formatMoney(r.total)}
      </span>
    ),
  },
];

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [pos, setPos] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fetchKey, setFetchKey] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback((pg: number) => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("page", String(pg));
    params.set("limit", "50");
    return params;
  }, [debouncedSearch]);

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
          setTotal(data.pagination.total);
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
  }, [orgId, debouncedSearch]);

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
          setTotal(data.pagination.total);
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

  const pendingSearch = search !== debouncedSearch;

  // Group POs by status
  const groups = useMemo(() => {
    const active = pos.filter((p) =>
      ["sent", "partial"].includes(p.status)
    );
    const drafts = pos.filter((p) => p.status === "draft");
    const completed = pos.filter((p) =>
      ["received", "closed"].includes(p.status)
    );
    return { active, drafts, completed };
  }, [pos]);

  const totalValue = pos.reduce((s, p) => s + p.total, 0);
  const activeValue = groups.active.reduce((s, p) => s + p.total, 0);

  if (loading) return <BrandLoader />;

  if (pos.length === 0 && !debouncedSearch) {
    return (
      <BlurReveal>
        <div>
          {/* Full-width 3-step process */}
          <div className="grid grid-cols-3 gap-0 rounded-lg border overflow-hidden mb-8">
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
              <div key={step} className="relative flex flex-col items-center py-8 px-5 text-center border-r last:border-r-0">
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
            <div className="pointer-events-none grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-lg bg-muted" />
                    <div className="flex-1 space-y-1.5">
                      <div className={`h-2.5 rounded bg-muted ${i % 2 === 0 ? "w-20" : "w-24"}`} />
                      <div className={`h-2 rounded bg-muted/60 ${i % 2 === 0 ? "w-32" : "w-28"}`} />
                    </div>
                    <div className={`h-2.5 w-16 rounded bg-muted/40`} />
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-content-bg/10 via-content-bg/60 to-content-bg" />

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <h2 className="text-xl font-semibold tracking-tight">
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
      </BlurReveal>
    );
  }

  return (
    <BlurReveal>
      <div className="space-y-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Purchase Orders
            </h1>
            <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                <span className="font-medium text-foreground tabular-nums">
                  {total || pos.length}
                </span>{" "}
                orders
              </span>
              <span className="text-border">|</span>
              <span>
                Total{" "}
                <span className="font-mono font-medium text-foreground">
                  {formatMoney(totalValue)}
                </span>
              </span>
              {activeValue > 0 && (
                <>
                  <span className="text-border">|</span>
                  <span>
                    Active{" "}
                    <span className="font-mono font-medium text-blue-600 dark:text-blue-400">
                      {formatMoney(activeValue)}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => openDrawer("purchaseOrder")}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New PO
          </Button>
        </div>

        <div className="h-px bg-gradient-to-r from-blue-500/20 via-border to-transparent" />

        {/* Active orders - card grid */}
        {groups.active.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Truck className="size-4 text-blue-500" />
              <h2 className="text-sm font-medium">
                Active Orders
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                ({groups.active.length})
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {groups.active.map((po) => (
                <button
                  key={po.id}
                  onClick={() => router.push(`/purchases/orders/${po.id}`)}
                  className="flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-accent transition-colors group"
                >
                  <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40 shrink-0">
                    <Package className="size-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-medium">
                        {po.poNumber}
                      </span>
                      <Badge
                        variant="outline"
                        className={statusColors[po.status] || ""}
                      >
                        {po.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {po.contact?.name || "No supplier"}
                      {po.deliveryDate && ` · Due ${po.deliveryDate}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-medium tabular-nums">
                      {formatMoney(po.total)}
                    </p>
                    <ChevronRight className="size-3.5 text-muted-foreground ml-auto mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Drafts - compact list */}
        {groups.drafts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">Drafts</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                ({groups.drafts.length})
              </span>
            </div>
            <div className="rounded-lg border divide-y">
              {groups.drafts.map((po) => (
                <button
                  key={po.id}
                  onClick={() => router.push(`/purchases/orders/${po.id}`)}
                  className="flex items-center justify-between w-full px-4 py-2.5 text-left hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-mono">{po.poNumber}</span>
                    <span className="text-sm text-muted-foreground truncate">
                      {po.contact?.name || "-"}
                    </span>
                  </div>
                  <span className="text-sm font-mono tabular-nums shrink-0">
                    {formatMoney(po.total)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Completed / all orders table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Package className="size-4 text-emerald-500" />
              <h2 className="text-sm font-medium">All Orders</h2>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-8 text-xs"
              />
            </div>
          </div>

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
                  emptyMessage="No purchase orders found."
                  onRowClick={(r) =>
                    router.push(`/purchases/orders/${r.id}`)
                  }
                />
              </motion.div>
            </MotionConfig>
          )}
        </div>

        {/* Infinite scroll sentinel */}
        {hasMore && !refetching && (
          <div ref={sentinelRef} className="flex items-center justify-center py-6">
            {loadingMore && (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            )}
          </div>
        )}
      </div>
    </BlurReveal>
  );
}

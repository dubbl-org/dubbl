"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import {
  Package,
  AlertTriangle,
  Search,
  ChevronRight,
  DollarSign,
  TrendingUp,
  X,
  Archive,
  ArrowUpDown,
  Download,
  Trash2,
  Power,
  PowerOff,
  Tag,
  Loader2,
  ClipboardList,
  Warehouse,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { formatMoney } from "@/lib/money";

import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@/lib/utils";

interface InventoryItem {
  id: string;
  code: string;
  name: string;
  category: string | null;
  sku: string | null;
  purchasePrice: number;
  salePrice: number;
  quantityOnHand: number;
  reorderPoint: number;
  isActive: boolean;
}

type FilterTab = "all" | "low_stock" | "active" | "inactive";
type SortKey = "name" | "code" | "quantity" | "salePrice" | "purchasePrice" | "createdAt";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "createdAt", label: "Newest" },
  { value: "name", label: "Name" },
  { value: "code", label: "Code" },
  { value: "quantity", label: "Quantity" },
  { value: "salePrice", label: "Sale Price" },
  { value: "purchasePrice", label: "Cost" },
];

const PAGE_SIZE = 30;

export default function InventoryPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState({ totalItems: 0, totalValue: 0, lowStockCount: 0, avgMargin: 0 });
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [sortBy, setSortBy] = useState<SortKey>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkAdjustOpen, setBulkAdjustOpen] = useState(false);
  const [bulkAdjustment, setBulkAdjustment] = useState("");
  const [bulkAdjustReason, setBulkAdjustReason] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const debouncedSearch = useDebounce(search);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef(1);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "/" && !isInput) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        if (selectMode) {
          setSelectMode(false);
          setSelected(new Set());
        } else if (document.activeElement === searchRef.current) {
          searchRef.current?.blur();
          if (search) setSearch("");
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectMode, search]);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const buildUrl = useCallback((page: number) => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (tab === "low_stock") params.set("status", "low_stock");
    else if (tab === "active") params.set("status", "active");
    else if (tab === "inactive") params.set("status", "inactive");
    if (categoryFilter && categoryFilter !== "all") params.set("category", categoryFilter);
    params.set("sortBy", sortBy);
    params.set("sortOrder", sortOrder);
    return `/api/v1/inventory?${params}`;
  }, [debouncedSearch, tab, categoryFilter, sortBy, sortOrder]);

  // Initial + filter change fetch
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const isRefetch = !loading;
    if (isRefetch) setRefetching(true);
    pageRef.current = 1;

    fetch(buildUrl(1), { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.data) {
          setItems(data.data);
          setTotalCount(data.pagination?.total || 0);
          setHasMore((data.pagination?.page || 1) < (data.pagination?.totalPages || 1));
        }
        if (data.categories) setCategories(data.categories);
        if (data.summary) setSummary(data.summary);
      })
      .finally(() => { if (!cancelled) { setLoading(false); setRefetching(false); setFetchKey((k) => k + 1); } });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, debouncedSearch, tab, categoryFilter, sortBy, sortOrder, buildUrl]);

  // Load more (infinite scroll)
  const loadMore = useCallback(() => {
    if (!orgId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;

    fetch(buildUrl(nextPage), { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setItems((prev) => [...prev, ...data.data]);
          pageRef.current = nextPage;
          setHasMore(nextPage < (data.pagination?.totalPages || 1));
        }
      })
      .finally(() => setLoadingMore(false));
  }, [orgId, loadingMore, hasMore, buildUrl]);

  // Intersection observer for infinite scroll
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

  // Stats from API summary (real DB aggregates, not just loaded items)

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  };

  const selectionCount = selected.size;
  const isAllSelected = items.length > 0 && selected.size === totalCount;
  const isPartialSelected = selected.size > 0 && selected.size < totalCount;

  // Bulk actions
  async function bulkAction(action: string, extra?: Record<string, unknown>) {
    if (!orgId || selectionCount === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/v1/inventory/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ action, ids: Array.from(selected), ...extra }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      const data = await res.json();
      toast.success(`${data.affected} item${data.affected !== 1 ? "s" : ""} updated`);
      setSelected(new Set());
      // Refresh
      pageRef.current = 1;
      const refreshRes = await fetch(buildUrl(1), { headers: { "x-organization-id": orgId } });
      const refreshData = await refreshRes.json();
      if (refreshData.data) {
        setItems(refreshData.data);
        setTotalCount(refreshData.pagination?.total || 0);
        setHasMore((refreshData.pagination?.page || 1) < (refreshData.pagination?.totalPages || 1));
      }
      if (refreshData.categories) setCategories(refreshData.categories);
      if (refreshData.summary) setSummary(refreshData.summary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkDelete() {
    const confirmed = await confirm({
      title: `Delete ${selectionCount} item${selectionCount !== 1 ? "s" : ""}?`,
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (confirmed) await bulkAction("delete");
  }

  function exportCsv() {
    const headers = ["Code", "Name", "Category", "SKU", "Quantity", "Reorder Point", "Purchase Price", "Sale Price", "Status"];
    const rows = items.map((i) => [
      i.code,
      i.name,
      i.category || "",
      i.sku || "",
      i.quantityOnHand,
      i.reorderPoint,
      (i.purchasePrice / 100).toFixed(2),
      (i.salePrice / 100).toFixed(2),
      i.isActive ? "Active" : "Inactive",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }

  function toggleSortOrder() {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  if (loading) return <BrandLoader />;

  const pendingSearch = search !== debouncedSearch;

  if (!refetching && !pendingSearch && items.length === 0 && !debouncedSearch && tab === "all" && categoryFilter === "all") {
    return (
      <ContentReveal>
        <EmptyState
          icon={Package}
          title="No inventory items yet"
          description="Add your first product or item to start tracking inventory."
        >
          <Button onClick={() => openDrawer("inventory")} className="bg-emerald-600 hover:bg-emerald-700">
            New Item
          </Button>
        </EmptyState>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Package className="size-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Total Items</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums">{summary.totalItems}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="size-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Stock Value</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums">{formatMoney(summary.totalValue)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className={cn("size-3.5", summary.lowStockCount > 0 && "text-amber-500")} />
            <span className="text-[11px] font-medium uppercase tracking-wide">Low Stock</span>
          </div>
          <p className={cn(
            "mt-2 text-2xl font-bold font-mono tabular-nums",
            summary.lowStockCount > 0 && "text-amber-600 dark:text-amber-400"
          )}>
            {summary.lowStockCount}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="size-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Avg. Margin</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums">
            {summary.avgMargin > 0 ? `${summary.avgMargin.toFixed(1)}%` : "-"}
          </p>
        </div>
      </div>

      {/* Toolbar - top row swaps between tabs and select actions, search/filters always visible */}
      <div className="flex flex-col gap-3">
        {/* Top row: tabs+buttons or select actions */}
        <AnimatePresence initial={false} mode="popLayout">
          {selectMode ? (
            <motion.div
              key="select-bar"
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(4px)" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="flex items-center gap-2 flex-wrap"
            >
              <div className="flex items-center gap-2 mr-auto">
                <Checkbox
                  checked={isAllSelected ? true : isPartialSelected ? "indeterminate" : false}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm font-medium">
                  {selectionCount > 0 ? `${selectionCount} selected` : "Select items"}
                </span>
              </div>

              <AnimatePresence>
                {selectionCount > 0 && (
                  <motion.div
                    initial={{ opacity: 0, filter: "blur(4px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, filter: "blur(4px)" }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2 flex-wrap"
                  >
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkAction("set_active")} disabled={bulkLoading}>
                      <Power className="size-3 mr-1.5" />Active
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkAction("set_inactive")} disabled={bulkLoading}>
                      <PowerOff className="size-3 mr-1.5" />Inactive
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBulkCategoryOpen(true)} disabled={bulkLoading}>
                      <Tag className="size-3 mr-1.5" />Category
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBulkAdjustOpen(true)} disabled={bulkLoading}>
                      <ArrowUpDown className="size-3 mr-1.5" />Adjust
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30" onClick={handleBulkDelete} disabled={bulkLoading}>
                      <Trash2 className="size-3 mr-1.5" />Delete
                    </Button>
                    {bulkLoading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setSelectMode(false); setSelected(new Set()); }}
              >
                Done
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="tabs-bar"
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(4px)" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="low_stock">Low Stock</TabsTrigger>
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="inactive">Inactive</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-2">
                <Link href="/inventory/stock-takes">
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground">
                    <ClipboardList className="size-3" />
                    <span className="hidden sm:inline">Stock Takes</span>
                  </Button>
                </Link>
                <Link href="/inventory/warehouses">
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground">
                    <Warehouse className="size-3" />
                    <span className="hidden sm:inline">Warehouses</span>
                  </Button>
                </Link>
                <Link href="/inventory/valuation">
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5 text-muted-foreground">
                    <BarChart3 className="size-3" />
                    <span className="hidden sm:inline">Valuation</span>
                  </Button>
                </Link>
                <div className="w-px h-5 bg-border" />
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setSelectMode(true)}>
                  Select
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={exportCsv}>
                  <Download className="size-3" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search, filters, sort - always visible */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Search by name, code, or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8 h-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {categories.length > 0 && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 w-full sm:w-[160px] text-xs">
                <Tag className="size-3 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs">
              <ArrowUpDown className="size-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={toggleSortOrder}>
            <ArrowUpDown className={cn("size-3.5 transition-transform", sortOrder === "asc" && "rotate-180")} />
          </Button>
        </div>
      </div>

      {/* Item list */}
      {refetching || pendingSearch ? (
        <div className="flex items-center justify-center py-20">
          <div className="brand-loader" aria-label="Loading">
            <div className="brand-loader-circle brand-loader-circle-1" />
            <div className="brand-loader-circle brand-loader-circle-2" />
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
            {tab === "low_stock" ? <AlertTriangle className="size-5 text-muted-foreground" /> : <Archive className="size-5 text-muted-foreground" />}
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {debouncedSearch ? `No items match "${debouncedSearch}"` : "No items found"}
          </p>
        </div>
      ) : (
        <MotionConfig reducedMotion="never">
        <motion.div
          key={fetchKey}
          initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: "opacity, transform, filter" }}
        >
        <div className="rounded-xl border bg-card divide-y">
          {items.map((item) => {
            const isLow = item.quantityOnHand <= item.reorderPoint && item.isActive;
            const isSelected = selected.has(item.id);
            const stockPercent = item.reorderPoint > 0
              ? Math.min((item.quantityOnHand / (item.reorderPoint * 3)) * 100, 100)
              : 100;

            return (
              <div
                key={item.id}
                className={cn(
                  "group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-200",
                  "hover:bg-muted/40",
                  isSelected && "bg-primary/5"
                )}
                onClick={() => {
                  if (selectMode) toggleSelect(item.id);
                  else router.push(`/inventory/${item.id}`);
                }}
              >
                {/* Checkbox - slides in during select mode */}
                <div
                  className={cn(
                    "shrink-0 overflow-hidden transition-all duration-200 ease-out",
                    selectMode ? "w-5 opacity-100" : "w-0 opacity-0"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(item.id)}
                  />
                </div>

                {/* Icon + info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
                    isLow ? "bg-amber-50 dark:bg-amber-950/40" : item.isActive ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-muted"
                  )}>
                    <Package className={cn(
                      "size-4",
                      isLow ? "text-amber-600 dark:text-amber-400" : item.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                    )} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      {isLow && (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] px-1.5 py-0">Low</Badge>
                      )}
                      {!item.isActive && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.code}
                      {item.sku ? ` · ${item.sku}` : ""}
                      {item.category ? ` · ${item.category}` : ""}
                    </p>
                  </div>
                </div>

                {/* Stock bar */}
                <div className="hidden sm:flex flex-col items-end gap-1 w-24">
                  <span className={cn("text-xs font-mono tabular-nums font-medium", isLow ? "text-amber-600 dark:text-amber-400" : "")}>
                    {item.quantityOnHand}
                  </span>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className={cn("h-full rounded-full", isLow ? "bg-amber-500" : "bg-emerald-500")}
                      initial={{ width: 0 }}
                      animate={{ width: `${stockPercent}%` }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                    />
                  </div>
                </div>

                {/* Prices */}
                <div className="hidden md:flex flex-col items-end gap-0.5 w-24">
                  <span className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(item.salePrice)}</span>
                  <span className="text-[11px] font-mono tabular-nums text-muted-foreground">Cost {formatMoney(item.purchasePrice)}</span>
                </div>

                {/* Value */}
                <div className="hidden lg:block text-right w-24">
                  <p className="text-xs font-mono tabular-nums font-medium">{formatMoney(item.quantityOnHand * item.purchasePrice)}</p>
                  <p className="text-[11px] text-muted-foreground">value</p>
                </div>

                <div className={cn(
                  "shrink-0 overflow-hidden transition-all duration-200 ease-out",
                  selectMode ? "w-0 opacity-0" : "w-4 opacity-100"
                )}>
                  <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </div>
              </div>
            );
          })}

          {!hasMore && items.length > 0 && (
            <div className="py-3 text-center">
              <span className="text-[11px] text-muted-foreground">
                Showing all {items.length} item{items.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
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

      {/* Bulk set category sheet */}
      <Sheet open={bulkCategoryOpen} onOpenChange={setBulkCategoryOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>Set Category</SheetTitle></SheetHeader>
          <div className="space-y-4 px-4">
            <p className="text-sm text-muted-foreground">Set category for {selectionCount} selected item{selectionCount !== 1 ? "s" : ""}.</p>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                placeholder="e.g. Electronics, Office"
              />
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {categories.map((c) => (
                    <button
                      key={c}
                      onClick={() => setBulkCategory(c)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs transition-colors",
                        bulkCategory === c ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "hover:bg-muted"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setBulkCategoryOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                await bulkAction("set_category", { category: bulkCategory });
                setBulkCategoryOpen(false);
                setBulkCategory("");
              }}
              disabled={bulkLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {bulkLoading ? "Saving..." : "Apply"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Bulk adjust stock sheet */}
      <Sheet open={bulkAdjustOpen} onOpenChange={setBulkAdjustOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>Adjust Stock</SheetTitle></SheetHeader>
          <div className="space-y-4 px-4">
            <p className="text-sm text-muted-foreground">Adjust quantity for {selectionCount} selected item{selectionCount !== 1 ? "s" : ""}.</p>
            <div className="space-y-2">
              <Label>Adjustment (positive or negative)</Label>
              <Input
                type="number"
                value={bulkAdjustment}
                onChange={(e) => setBulkAdjustment(e.target.value)}
                placeholder="e.g. 10 or -5"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                value={bulkAdjustReason}
                onChange={(e) => setBulkAdjustReason(e.target.value)}
                placeholder="Reason for adjustment"
              />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setBulkAdjustOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                const adj = parseInt(bulkAdjustment);
                if (!adj) { toast.error("Enter a valid adjustment"); return; }
                await bulkAction("adjust_stock", { adjustment: adj, reason: bulkAdjustReason });
                setBulkAdjustOpen(false);
                setBulkAdjustment("");
                setBulkAdjustReason("");
              }}
              disabled={bulkLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {bulkLoading ? "Saving..." : "Apply"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {confirmDialog}
    </ContentReveal>
  );
}

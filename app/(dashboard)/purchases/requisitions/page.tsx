"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useRouter } from "next/navigation";
import {
  Plus,
  ClipboardCheck,
  Search,
  X,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/ui/date-picker";
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
} from "@/components/ui/sheet";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { motion, MotionConfig } from "motion/react";

interface Requisition {
  id: string;
  requisitionNumber: string;
  requestDate: string;
  requiredDate: string | null;
  status: string;
  subtotal: number;
  total: number;
  contact: { name: string } | null;
  lines: { id: string }[];
}

interface LineInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

const statusColors: Record<string, string> = {
  draft: "",
  submitted:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  approved:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
  converted:
    "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300",
};

function buildColumns(): Column<Requisition>[] {
  return [
    {
      key: "number",
      header: "Number",
      sortKey: "number",
      className: "w-32",
      render: (r) => (
        <span className="font-mono text-sm">{r.requisitionNumber}</span>
      ),
    },
    {
      key: "contact",
      header: "Supplier",
      render: (r) => (
        <span className="text-sm font-medium">
          {r.contact?.name || "-"}
        </span>
      ),
    },
    {
      key: "date",
      header: "Request Date",
      sortKey: "date",
      className: "w-28",
      render: (r) => <span className="text-sm">{r.requestDate}</span>,
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

const emptyLine = (): LineInput => ({
  description: "",
  quantity: 1,
  unitPrice: 0,
});

export default function RequisitionsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [sortBy, setSortBy] = useState("created");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fetchKey, setFetchKey] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formRequestDate, setFormRequestDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [formRequiredDate, setFormRequiredDate] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formLines, setFormLines] = useState<LineInput[]>([emptyLine()]);

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  useDocumentTitle("Purchases · Requisitions");

  const columns = useMemo(() => buildColumns(), []);

  const buildParams = useCallback(
    (pg: number) => {
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
    },
    [statusFilter, debouncedSearch, sortBy, sortOrder, dateFrom, dateTo]
  );

  // Reset and fetch page 1 when filters change
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const isRefetch = !loading;

    setPage(1);
    setHasMore(true);
    if (isRefetch) setRefetching(true);

    fetch(`/api/v1/purchase-requisitions?${buildParams(1)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.data) setItems(data.data);
        if (data.pagination) {
          setTotalCount(data.pagination.total);
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

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    orgId,
    statusFilter,
    debouncedSearch,
    sortBy,
    sortOrder,
    dateFrom,
    dateTo,
  ]);

  // Load next page
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !orgId) return;
    const nextPage = page + 1;
    setLoadingMore(true);

    fetch(`/api/v1/purchase-requisitions?${buildParams(nextPage)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setItems((prev) => [...prev, ...data.data]);
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
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
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

  function updateLine(idx: number, field: keyof LineInput, value: string | number) {
    setFormLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
    );
  }

  function removeLine(idx: number) {
    setFormLines((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate() {
    if (!orgId) return;
    const validLines = formLines.filter((l) => l.description.trim());
    if (validLines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/v1/purchase-requisitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          requestDate: formRequestDate,
          requiredDate: formRequiredDate || null,
          reference: formReference || null,
          notes: formNotes || null,
          lines: validLines,
        }),
      });

      if (res.ok) {
        toast.success("Requisition created");
        setSheetOpen(false);
        resetForm();
        // Refresh
        setLoading(true);
        setFetchKey((k) => k + 1);
        const data = await fetch(
          `/api/v1/purchase-requisitions?${buildParams(1)}`,
          { headers: { "x-organization-id": orgId } }
        ).then((r) => r.json());
        if (data.data) setItems(data.data);
        if (data.pagination) {
          setTotalCount(data.pagination.total);
          setHasMore(data.pagination.page < data.pagination.totalPages);
        }
        setLoading(false);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create");
      }
    } catch {
      toast.error("Failed to create requisition");
    } finally {
      setCreating(false);
    }
  }

  function resetForm() {
    setFormRequestDate(new Date().toISOString().split("T")[0]);
    setFormRequiredDate("");
    setFormReference("");
    setFormNotes("");
    setFormLines([emptyLine()]);
  }

  if (loading) return <BrandLoader />;

  if (
    totalCount === 0 &&
    statusFilter === "all" &&
    !debouncedSearch &&
    !hasFilters
  ) {
    return (
      <ContentReveal>
        <div>
          {/* Pipeline steps */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-0 rounded-lg border overflow-hidden mb-8">
            {[
              {
                label: "Draft",
                desc: "Create requisition",
                color: "bg-gray-400",
                bg: "bg-gray-50 dark:bg-gray-900/30",
              },
              {
                label: "Submitted",
                desc: "Submit for approval",
                color: "bg-blue-500",
                bg: "bg-blue-50 dark:bg-blue-900/20",
              },
              {
                label: "Approved",
                desc: "Manager approves",
                color: "bg-emerald-500",
                bg: "bg-emerald-50 dark:bg-emerald-900/20",
              },
              {
                label: "Rejected",
                desc: "Request denied",
                color: "bg-red-500",
                bg: "bg-red-50 dark:bg-red-900/20",
              },
              {
                label: "Converted",
                desc: "Becomes a PO",
                color: "bg-purple-500",
                bg: "bg-purple-50 dark:bg-purple-900/20",
              },
            ].map(({ label, desc, color, bg }, i) => (
              <div
                key={label}
                className={`relative flex flex-col items-center py-6 px-3 text-center border-r last:border-r-0 ${bg}`}
              >
                <div
                  className={`absolute top-0 left-0 right-0 h-1 ${color} opacity-30`}
                />
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-muted-foreground/50 tabular-nums">
                    {i + 1}
                  </span>
                  <div className={`size-2.5 rounded-full ${color}`} />
                </div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {desc}
                </p>
              </div>
            ))}
          </div>

          {/* Skeleton table + CTA overlay */}
          <div className="relative">
            <div className="pointer-events-none w-full rounded-lg border overflow-hidden">
              <div className="flex items-center gap-4 border-b bg-muted/50 px-4 h-10">
                <div className="h-2 w-28 rounded bg-muted-foreground/20" />
                <div className="h-2 w-20 rounded bg-muted-foreground/20" />
                <div className="h-2 w-16 rounded bg-muted-foreground/20 hidden sm:block" />
                <div className="ml-auto h-2 w-16 rounded bg-muted-foreground/20" />
                <div className="h-2 w-16 rounded bg-muted-foreground/20" />
              </div>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 border-b last:border-0 px-4 h-12"
                >
                  <div
                    className={`h-2.5 rounded bg-muted flex-1 max-w-[200px] ${i % 2 === 0 ? "max-w-[180px]" : "max-w-[220px]"}`}
                  />
                  <div
                    className={`h-2.5 rounded bg-muted/60 ${i % 2 === 0 ? "w-24" : "w-20"} hidden sm:block`}
                  />
                  <div className="h-2.5 w-20 rounded bg-muted/50 hidden sm:block" />
                  <div
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium hidden sm:block ${
                      i % 3 === 0
                        ? "bg-blue-100 text-blue-400 dark:bg-blue-900/40 dark:text-blue-500"
                        : i % 3 === 1
                          ? "bg-emerald-100 text-emerald-400 dark:bg-emerald-900/40 dark:text-emerald-500"
                          : "bg-purple-100 text-purple-400 dark:bg-purple-900/40 dark:text-purple-500"
                    }`}
                  >
                    {i % 3 === 0
                      ? "submitted"
                      : i % 3 === 1
                        ? "approved"
                        : "converted"}
                  </div>
                  <div
                    className={`h-2.5 rounded bg-muted/40 ${i % 2 === 0 ? "w-16" : "w-14"}`}
                  />
                </div>
              ))}
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-content-bg/20 via-content-bg/70 to-content-bg" />

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-purple-100 dark:bg-purple-950/50">
                <ClipboardCheck className="size-7 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="mt-5 text-xl font-semibold tracking-tight">
                No purchase requisitions yet
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
                Create purchase requisitions to request purchases that require
                approval before ordering.
              </p>
              <Button
                onClick={() => setSheetOpen(true)}
                size="lg"
                className="mt-6 bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="mr-2 size-4" />
                New Requisition
              </Button>
            </div>
          </div>

          <CreateSheet />
        </div>
      </ContentReveal>
    );
  }

  function CreateSheet() {
    return (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="max-h-[85vh]">
          <SheetHeader>
            <SheetTitle>New Purchase Requisition</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Request Date</Label>
                <Input
                  type="date"
                  value={formRequestDate}
                  onChange={(e) => setFormRequestDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Required By</Label>
                <Input
                  type="date"
                  value={formRequiredDate}
                  onChange={(e) => setFormRequiredDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Reference</Label>
              <Input
                value={formReference}
                onChange={(e) => setFormReference(e.target.value)}
                placeholder="Optional reference"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Optional notes"
                rows={2}
              />
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Line Items</Label>
              {formLines.map((line, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 rounded-lg border p-3"
                >
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) =>
                        updateLine(idx, "description", e.target.value)
                      }
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">
                          Qty
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(
                              idx,
                              "quantity",
                              Number(e.target.value)
                            )
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">
                          Unit Price
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(
                              idx,
                              "unitPrice",
                              Number(e.target.value)
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                  {formLines.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 size-8 text-muted-foreground hover:text-red-600"
                      onClick={() => removeLine(idx)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  setFormLines((prev) => [...prev, emptyLine()])
                }
              >
                <Plus className="mr-2 size-3.5" />
                Add Line
              </Button>
            </div>

            <Button
              onClick={handleCreate}
              disabled={creating}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {creating ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              Create Requisition
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <ContentReveal>
      <div className="space-y-3 sm:space-y-6">
        {/* Header */}
        <PageHeader
          title="Purchase Requisitions"
          description="Request and approve purchases before ordering."
        >
          <Button
            size="sm"
            onClick={() => setSheetOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New Requisition
          </Button>
        </PageHeader>

        <div className="h-px bg-border" />

        {/* Status tabs + search */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all" className="whitespace-nowrap">
                  All ({totalCount})
                </TabsTrigger>
                <TabsTrigger value="draft" className="whitespace-nowrap">
                  Draft
                </TabsTrigger>
                <TabsTrigger value="submitted" className="whitespace-nowrap">
                  Submitted
                </TabsTrigger>
                <TabsTrigger value="approved" className="whitespace-nowrap">
                  Approved
                </TabsTrigger>
                <TabsTrigger value="rejected" className="whitespace-nowrap">
                  Rejected
                </TabsTrigger>
                <TabsTrigger value="converted" className="whitespace-nowrap">
                  Converted
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search requisitions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Date filters + sort */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">
              From
            </span>
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
                data={items}
                loading={loading}
                emptyMessage="No requisitions match your filters."
                onRowClick={(r) =>
                  router.push(`/purchases/requisitions/${r.id}`)
                }
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
            </motion.div>
          </MotionConfig>
        )}

        {/* Infinite scroll sentinel */}
        {hasMore && !refetching && (
          <div
            ref={sentinelRef}
            className="flex items-center justify-center py-6"
          >
            {loadingMore && (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            )}
          </div>
        )}

        <CreateSheet />
      </div>
    </ContentReveal>
  );
}

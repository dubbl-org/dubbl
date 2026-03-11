"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useRouter } from "next/navigation";
import { Plus, CreditCard, ReceiptText, X, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { devDelay } from "@/lib/dev-delay";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";

interface CreditNote {
  id: string;
  creditNoteNumber: string;
  issueDate: string;
  status: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountApplied: number;
  amountRemaining: number;
  contact: { name: string } | null;
  invoiceId: string | null;
}

const statusColors: Record<string, string> = {
  draft: "",
  sent: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  applied:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

function buildColumns(): Column<CreditNote>[] {
  return [
    {
      key: "number",
      header: "Number",
      sortKey: "number",
      className: "w-32",
      render: (r) => (
        <span className="font-mono text-sm">{r.creditNoteNumber}</span>
      ),
    },
    {
      key: "contact",
      header: "Customer",
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
    {
      key: "remaining",
      header: "Remaining",
      sortKey: "remaining",
      className: "w-28 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {formatMoney(r.amountRemaining)}
        </span>
      ),
    },
  ];
}

export default function CreditNotesPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [fetchKey, setFetchKey] = useState(0);
  const [summary, setSummary] = useState<{
    totalCount: number;
    totalAmount: number;
    totalApplied: number;
    totalRemaining: number;
    statusBreakdown: Record<string, { count: number; amount: number }>;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const PAGE_SIZE = 50;
  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const columns = useMemo(() => buildColumns(), []);

  const buildParams = useCallback((p: number) => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (sortBy !== "created") params.set("sortBy", sortBy);
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    params.set("page", String(p));
    params.set("limit", String(PAGE_SIZE));
    return params;
  }, [statusFilter, sortBy, sortOrder, dateFrom, dateTo]);

  // Fetch first page when filters change
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRefetching(true);
    setPage(1);

    fetch(`/api/v1/credit-notes?${buildParams(1)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setCreditNotes(data.data || []);
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

    fetch(`/api/v1/credit-notes?${buildParams(nextPage)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setCreditNotes((prev) => [...prev, ...data.data]);
          setPage(nextPage);
        }
      })
      .finally(() => setLoadingMore(false));
  }, [orgId, page, buildParams, loadingMore]);

  const hasMore = creditNotes.length < totalCount;
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
    fetch(`/api/v1/credit-notes/summary`, {
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

  const hasFilters = search || dateFrom || dateTo;
  const pendingSearch = search !== debouncedSearch;

  const [searchKey, setSearchKey] = useState(0);
  const filteredCreditNotes = useMemo(() => {
    if (!debouncedSearch) return creditNotes;
    const q = debouncedSearch.toLowerCase();
    return creditNotes.filter(
      (cn) =>
        cn.creditNoteNumber.toLowerCase().includes(q) ||
        (cn.contact?.name || "").toLowerCase().includes(q)
    );
  }, [creditNotes, debouncedSearch]);

  // Bump searchKey when debounced search changes to trigger ContentReveal
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchKey((k) => k + 1);
  }, [debouncedSearch]);

  const totalIssued = summary?.totalAmount || 0;
  const totalApplied = summary?.totalApplied || 0;
  const totalRemaining = summary?.totalRemaining || 0;

  if (initialLoad) return <BrandLoader />;

  if (!initialLoad && !refetching && creditNotes.length === 0 && statusFilter === "all" && !hasFilters) {
    return (
      <ContentReveal>
        <div className="pt-12 pb-12 space-y-10">
          {/* Top: title + CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Credit Notes</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Issue credit notes to adjust invoices, handle refunds, or correct billing errors.
              </p>
            </div>
            <Button
              onClick={() => openDrawer("creditNote")}
              className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            >
              <Plus className="mr-2 size-4" />
              New Credit Note
            </Button>
          </div>

          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
            {/* Left: Ledger-style calculation */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How credit notes work</p>
              </div>
              <div className="divide-y">
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                      <ReceiptText className="size-3.5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Invoice total</p>
                      <p className="text-[11px] text-muted-foreground">INV-0042</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium">$1,200.00</span>
                </div>
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 bg-teal-50/30 dark:bg-teal-950/10">
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-md bg-teal-50 dark:bg-teal-950/40">
                      <CreditCard className="size-3.5 text-teal-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-teal-700 dark:text-teal-300">Credit applied</p>
                      <p className="text-[11px] text-muted-foreground">CN-0001</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium text-teal-600 dark:text-teal-400">-$200.00</span>
                </div>
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="size-7" />
                    <p className="text-sm font-semibold">New balance</p>
                  </div>
                  <span className="font-mono text-sm font-bold">$1,000.00</span>
                </div>
              </div>
            </div>

            {/* Right: Use cases */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">When to use</p>
              {[
                {
                  title: "Overcharged a customer",
                  desc: "Billed too much on an invoice? Issue a credit to correct the amount.",
                  color: "border-l-blue-400",
                },
                {
                  title: "Product returned",
                  desc: "Customer returned goods? Credit the original invoice and adjust the balance.",
                  color: "border-l-amber-400",
                },
                {
                  title: "Service not delivered",
                  desc: "Cancelled or incomplete work? Issue a partial or full credit note.",
                  color: "border-l-teal-400",
                },
                {
                  title: "Goodwill discount",
                  desc: "Offering a retroactive discount? Apply it as a credit against the invoice.",
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
        <StatCard title="Total Issued" value={formatMoney(totalIssued)} icon={CreditCard} />
        <StatCard title="Applied" value={formatMoney(totalApplied)} icon={CreditCard} />
        <StatCard title="Remaining" value={formatMoney(totalRemaining)} icon={CreditCard} />
      </div>

      <div className="h-px bg-border" />

      {/* Credit note table */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="overflow-x-auto">
              <TabsTrigger value="all" className="whitespace-nowrap">All</TabsTrigger>
              <TabsTrigger value="draft" className="whitespace-nowrap">Draft</TabsTrigger>
              <TabsTrigger value="sent" className="whitespace-nowrap">Sent</TabsTrigger>
              <TabsTrigger value="applied" className="whitespace-nowrap">Applied</TabsTrigger>
              <TabsTrigger value="void" className="whitespace-nowrap">Void</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            onClick={() => openDrawer("creditNote")}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New Credit Note
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search credit notes..."
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
              <SelectItem value="number:desc">Number (desc)</SelectItem>
              <SelectItem value="number:asc">Number (asc)</SelectItem>
            </SelectContent>
          </Select>
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
              data={filteredCreditNotes}
              loading={false}
              emptyMessage="No credit notes match your filters."
              onRowClick={(r) => router.push(`/sales/credit-notes/${r.id}`)}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
            />
          </ContentReveal>
        )}

        {/* Infinite scroll sentinel & count */}
        {!refetching && !pendingSearch && filteredCreditNotes.length > 0 && (
          <>
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Showing {creditNotes.length} of {totalCount} credit note{totalCount !== 1 ? "s" : ""}
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

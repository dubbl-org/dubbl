"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface LedgerEntry {
  entryId: string;
  entryNumber: number;
  date: string;
  description: string;
  debitAmount: string;
  creditAmount: string;
  balance: string;
}

const ledgerColumns: Column<LedgerEntry>[] = [
  {
    key: "number",
    header: "#",
    className: "w-16",
    render: (r) => (
      <a
        href={`/accounting/${r.entryId}`}
        className="font-mono text-xs text-emerald-600 hover:underline"
      >
        {r.entryNumber}
      </a>
    ),
  },
  {
    key: "date",
    header: "Date",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.date}</span>,
  },
  {
    key: "description",
    header: "Description",
    render: (r) => <span className="text-sm">{r.description}</span>,
  },
  {
    key: "debit",
    header: "Debit",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {parseFloat(r.debitAmount) > 0 ? parseFloat(r.debitAmount).toFixed(2) : ""}
      </span>
    ),
  },
  {
    key: "credit",
    header: "Credit",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {parseFloat(r.creditAmount) > 0 ? parseFloat(r.creditAmount).toFixed(2) : ""}
      </span>
    ),
  },
  {
    key: "balance",
    header: "Balance",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm font-medium tabular-nums">
        {parseFloat(r.balance).toFixed(2)}
      </span>
    ),
  },
];

export default function AccountLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("date:desc");
  const [entryType, setEntryType] = useState("all");

  const [refetching, setRefetching] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const pendingSearch = search !== debouncedSearch;

  const buildParams = useCallback((pageNum: number) => {
    const [sortBy, sortOrder] = sort.split(":");
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    if (entryType !== "all") params.set("entryType", entryType);
    if (sortBy !== "date") params.set("sortBy", sortBy);
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    params.set("page", String(pageNum));
    params.set("limit", "50");
    return params;
  }, [debouncedSearch, dateFrom, dateTo, entryType, sort]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const isRefetch = !loading;
    setPage(1);
    setHasMore(true);
    if (isRefetch) setRefetching(true);

    fetch(`/api/v1/accounts/${id}?${buildParams(1)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.data) setLedger(data.data);
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
  }, [id, debouncedSearch, dateFrom, dateTo, entryType, sort]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !orgId) return;
    const nextPage = page + 1;
    setLoadingMore(true);

    fetch(`/api/v1/accounts/${id}?${buildParams(nextPage)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setLedger((prev) => [...prev, ...data.data]);
        if (data.pagination) {
          setPage(data.pagination.page);
          setTotal(data.pagination.total);
          setHasMore(data.pagination.page < data.pagination.totalPages);
        }
      })
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, page, id, orgId, buildParams]);

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

  const summary = useMemo(() => {
    const totalDebits = ledger.reduce((s, e) => s + parseFloat(e.debitAmount), 0);
    const totalCredits = ledger.reduce((s, e) => s + parseFloat(e.creditAmount), 0);
    return { totalDebits, totalCredits };
  }, [ledger]);

  const hasFilters = search || dateFrom || dateTo || entryType !== "all";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Ledger</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{total} entries</span>
      </div>

      <Tabs value={entryType} onValueChange={setEntryType}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="debits">Debits</TabsTrigger>
          <TabsTrigger value="credits">Credits</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search description or entry #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
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
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date:desc">Newest first</SelectItem>
            <SelectItem value="date:asc">Oldest first</SelectItem>
            <SelectItem value="number:desc">Entry # (high-low)</SelectItem>
            <SelectItem value="number:asc">Entry # (low-high)</SelectItem>
            <SelectItem value="amount:desc">Largest amount</SelectItem>
            <SelectItem value="amount:asc">Smallest amount</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => {
              setSearch("");
              setDateFrom("");
              setDateTo("");
              setEntryType("all");
            }}
          >
            <X className="mr-1 size-3" />
            Clear filters
          </Button>
        )}
      </div>

      {refetching || pendingSearch ? (
        <div className="flex items-center justify-center py-20">
          <div className="brand-loader" aria-label="Loading">
            <div className="brand-loader-circle brand-loader-circle-1" />
            <div className="brand-loader-circle brand-loader-circle-2" />
          </div>
        </div>
      ) : (
        <MotionConfig reducedMotion="never">
          <motion.div
            key={fetchKey}
            initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "opacity, transform, filter" }}
            className="overflow-x-auto"
          >
            <DataTable
              columns={ledgerColumns}
              data={ledger}
              emptyMessage={hasFilters ? "No entries match your filters." : "No transactions in this account yet."}
            />
          </motion.div>
        </MotionConfig>
      )}

      {hasMore && !refetching && <div ref={sentinelRef} className="h-1" />}
      {loadingMore && (
        <div className="flex items-center justify-center py-4">
          <div className="brand-loader" aria-label="Loading more">
            <div className="brand-loader-circle brand-loader-circle-1" />
            <div className="brand-loader-circle brand-loader-circle-2" />
          </div>
        </div>
      )}
    </div>
  );
}

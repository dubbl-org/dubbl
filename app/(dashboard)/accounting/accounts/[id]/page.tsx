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
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useApi } from "@/lib/query/use-api";
import { formatMoney } from "@/lib/money";
import { useAccountContext } from "./layout";

interface LedgerEntry {
  entryId: string;
  entryNumber: number;
  date: string;
  description: string;
  // Integer cents, like every amount the API returns.
  debitAmount: number;
  creditAmount: number;
  balance: number;
}

const ledgerColumns = (currency: string): Column<LedgerEntry>[] => [
  {
    key: "number",
    header: "#",
    className: "w-16",
    render: (r) => (
      <a
        href={`/accounting/${r.entryId}`}
        className="font-mono text-xs text-brand-600 hover:underline"
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
        {r.debitAmount > 0 ? formatMoney(r.debitAmount, currency) : ""}
      </span>
    ),
  },
  {
    key: "credit",
    header: "Credit",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {r.creditAmount > 0 ? formatMoney(r.creditAmount, currency) : ""}
      </span>
    ),
  },
  {
    key: "balance",
    header: "Balance",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm font-medium tabular-nums">
        {formatMoney(r.balance, currency)}
      </span>
    ),
  },
];

export default function AccountLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const { account } = useAccountContext();
  const currency = account?.currencyCode || "USD";
  const columns = useMemo(() => ledgerColumns(currency), [currency]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("date:desc");
  const [entryType, setEntryType] = useState("all");

  // Pages loaded by scrolling, on top of the cached first page. Tied to the filters they were loaded for.
  const [more, setMore] = useState<{ key: string; rows: LedgerEntry[]; page: number; total: number; hasMore: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useDocumentTitle("Accounting \u00B7 Account Details");

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

  const firstUrl = `/api/v1/accounts/${id}?${buildParams(1)}`;
  const { data: first, refreshing } = useApi<{ data?: LedgerEntry[]; pagination?: { page: number; total: number; totalPages: number } }>(firstUrl, {
    keepPrevious: true,
    learn: !debouncedSearch,
  });
  const extra = more?.key === firstUrl ? more : null;
  const ledger = useMemo(() => [...(first?.data ?? []), ...(extra?.rows ?? [])], [first, extra]);
  const total = extra?.total ?? first?.pagination?.total ?? 0;
  const page = extra?.page ?? 1;
  const hasMore = extra ? extra.hasMore : first?.pagination ? first.pagination.page < first.pagination.totalPages : false;

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !orgId) return;
    const nextPage = page + 1;
    const key = firstUrl;
    setLoadingMore(true);

    fetch(`/api/v1/accounts/${id}?${buildParams(nextPage)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        setMore((prev) => {
          const base = prev?.key === key ? prev : { key, rows: [] as LedgerEntry[], page: 1, total: 0, hasMore: true };
          return {
            key,
            rows: data.data ? [...base.rows, ...data.data] : base.rows,
            page: data.pagination ? data.pagination.page : base.page,
            total: data.pagination ? data.pagination.total : base.total,
            hasMore: data.pagination ? data.pagination.page < data.pagination.totalPages : base.hasMore,
          };
        });
      })
      .finally(() => setLoadingMore(false));
  }, [loadingMore, hasMore, page, id, orgId, buildParams, firstUrl]);

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

  const hasFilters = search || dateFrom || dateTo || entryType !== "all";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Transactions</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{total} entries</span>
      </div>

      <Tabs value={entryType} onValueChange={setEntryType}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger
            value="debits"
            title="The left column. For cash and what you're owed, this is money in; for income and what you owe, it's money out."
          >
            Debits
          </TabsTrigger>
          <TabsTrigger
            value="credits"
            title="The right column. For cash and what you're owed, this is money out; for income and what you owe, it's money in."
          >
            Credits
          </TabsTrigger>
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

      {pendingSearch ? (
        <div className="flex items-center justify-center py-20">
          <div className="brand-loader" aria-label="Loading">
            <div className="brand-loader-circle brand-loader-circle-1" />
            <div className="brand-loader-circle brand-loader-circle-2" />
          </div>
        </div>
      ) : (
        <MotionConfig reducedMotion="never">
          <motion.div
            key={firstUrl}
            initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "opacity, transform, filter" }}
            className="overflow-x-auto"
          >
            <DataTable
              columns={columns}
              data={ledger}
              emptyMessage={hasFilters ? "No entries match your filters." : "No transactions in this account yet."}
            />
          </motion.div>
        </MotionConfig>
      )}

      {hasMore && !refreshing && <div ref={sentinelRef} className="h-1" />}
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

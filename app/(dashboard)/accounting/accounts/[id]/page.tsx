"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Search, Settings2, X } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
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
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";

interface LedgerEntry {
  entryId: string;
  entryNumber: number;
  date: string;
  description: string;
  debitAmount: string;
  creditAmount: string;
  balance: string;
}

interface AccountDetail {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: string;
  description?: string | null;
  currencyCode?: string;
  isActive?: boolean;
}

const TYPE_STYLE: Record<string, string> = {
  asset: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  liability: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
  equity: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300",
  revenue: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  expense: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

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
  const router = useRouter();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

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
        if (data.account) setAccount(data.account);
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

  if (loading) return <BrandLoader />;

  if (!account) {
    return <p className="text-muted-foreground">Account not found.</p>;
  }

  const bal = parseFloat(account.balance);
  const cur = account.currencyCode || "USD";
  const hasFilters = search || dateFrom || dateTo || entryType !== "all";

  return (
    <ContentReveal>
      {/* Back link */}
      <button
        onClick={() => router.push("/accounting/accounts")}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="size-3.5" />
        Back to accounts
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-base sm:text-lg font-semibold tracking-tight">{account.name}</h1>
            <Badge variant="outline" className={TYPE_STYLE[account.type] || ""}>
              {account.type}
            </Badge>
            <Badge variant="outline" className="text-[10px]">{cur}</Badge>
            {account.isActive === false && (
              <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className="font-mono">{account.code}</span>
            {account.description && <> · {account.description}</>}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/accounting/accounts/${id}/settings`)}
        >
          <Settings2 className="mr-2 size-3.5" />
          Settings
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-8">
        <div>
          <p className="text-[11px] text-muted-foreground">Balance</p>
          <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums">
            {formatMoney(Math.round(bal * 100), cur)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <ArrowDownRight className="size-3 text-emerald-500" />
            Total Debits
          </p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-emerald-600">
            {formatMoney(Math.round(summary.totalDebits * 100), cur)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <ArrowUpRight className="size-3 text-red-500" />
            Total Credits
          </p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-red-600">
            {formatMoney(Math.round(summary.totalCredits * 100), cur)}
          </p>
        </div>
      </div>

      {/* Ledger */}
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
    </ContentReveal>
  );
}

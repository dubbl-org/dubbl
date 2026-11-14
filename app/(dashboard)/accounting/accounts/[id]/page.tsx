"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/shared/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

interface LedgerEntry {
  entryId: string;
  entryNumber: number;
  date: string;
  description: string;
  debitAmount: string;
  creditAmount: string;
  balance: string;
}

/** One amount column: half of a debit/credit pair is always blank. */
function Amount({ debit, credit, currency }: { debit: string; credit: string; currency: string }) {
  const d = parseFloat(debit) || 0;
  const c = parseFloat(credit) || 0;
  const value = d > 0 ? d : c;
  const money = new Intl.NumberFormat("en", { style: "currency", currency }).format(value);
  return (
    <span className={d > 0 ? "text-sm tabular-nums" : "text-sm tabular-nums text-muted-foreground"}>
      {money}
    </span>
  );
}

export default function AccountLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [currency, setCurrency] = useState("USD");

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
        if (data.account?.currencyCode) setCurrency(data.account.currencyCode);
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
            <div className="overflow-hidden rounded-xl border">
              <div className="hidden grid-cols-[5rem_minmax(0,1fr)_7.5rem_7.5rem] items-center gap-4 border-b bg-muted/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                <span>Date</span>
                <span>Entry</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Balance</span>
              </div>
              {ledger.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {hasFilters
                    ? "No entries match your filters."
                    : "No transactions in this account yet."}
                </p>
              ) : (
                ledger.map((row) => {
                  const debit = parseFloat(row.debitAmount) || 0;
                  return (
                    <a
                      key={`${row.entryId}-${row.entryNumber}`}
                      href={`/accounting/${row.entryId}`}
                      className="group/row grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-b px-4 py-2.5 transition-colors last:border-b-0 hover:bg-accent/40 sm:grid-cols-[5rem_minmax(0,1fr)_7.5rem_7.5rem] sm:items-center"
                    >
                      <span className="text-[11px] tabular-nums text-muted-foreground sm:text-xs">
                        {row.date}
                      </span>
                      <div className="min-w-0 sm:order-none">
                        <p className="truncate text-sm group-hover/row:underline">{row.description}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          #{row.entryNumber}
                        </p>
                      </div>
                      <span className="shrink-0 text-right sm:order-none">
                        <Amount debit={row.debitAmount} credit={row.creditAmount} currency={currency} />
                      </span>
                      <span
                        className={cn(
                          "col-span-2 text-right text-sm font-medium tabular-nums sm:col-span-1",
                          debit > 0 ? "" : "text-muted-foreground"
                        )}
                      >
                        {new Intl.NumberFormat("en", { style: "currency", currency }).format(
                          parseFloat(row.balance) || 0
                        )}
                      </span>
                    </a>
                  );
                })
              )}
            </div>
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

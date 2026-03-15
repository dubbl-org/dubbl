"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useRouter } from "next/navigation";
import {
  Plus,
  ShoppingCart,
  Search,
  X,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Loader2,
  FileText,
} from "lucide-react";
import { Section } from "@/components/dashboard/section";
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
import { devDelay } from "@/lib/dev-delay";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { motion, MotionConfig } from "motion/react";

interface Bill {
  id: string;
  billNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  total: number;
  amountDue: number;
  contact: { name: string } | null;
}

const statusColors: Record<string, string> = {
  draft: "",
  received:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  partial:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  overdue:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

function getDueInfo(dueDate: string, status: string) {
  if (status === "paid" || status === "void" || status === "draft") return null;
  const now = new Date();
  const due = new Date(dueDate);
  const days = Math.floor((now.getTime() - due.getTime()) / 86400000);
  if (days <= 0) {
    const left = Math.abs(days);
    if (left === 0) return { label: "Due today", color: "text-amber-600" };
    if (left <= 7)
      return { label: `Due in ${left}d`, color: "text-muted-foreground" };
    return null;
  }
  if (days <= 30) return { label: `${days}d overdue`, color: "text-red-500" };
  if (days <= 90)
    return { label: `${days}d overdue`, color: "text-red-600 font-medium" };
  return {
    label: `${days}d overdue`,
    color: "text-red-700 font-semibold",
  };
}

function buildColumns(): Column<Bill>[] {
  return [
    {
      key: "number",
      header: "Number",
      sortKey: "number",
      className: "w-32",
      render: (r) => (
        <span className="font-mono text-sm">{r.billNumber}</span>
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
      render: (r) => <span className="text-sm">{r.issueDate}</span>,
    },
    {
      key: "due",
      header: "Due",
      sortKey: "due",
      className: "w-36",
      render: (r) => {
        const info = getDueInfo(r.dueDate, r.status);
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm">{r.dueDate}</span>
            {info && (
              <span className={`text-[11px] ${info.color}`}>{info.label}</span>
            )}
          </div>
        );
      },
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
      key: "due-amount",
      header: "Balance",
      sortKey: "amountDue",
      className: "w-28 text-right",
      render: (r) => {
        const color =
          r.amountDue > 0 && r.status !== "draft" ? "text-amber-600" : "";
        return (
          <span className={`font-mono text-sm tabular-nums ${color}`}>
            {formatMoney(r.amountDue)}
          </span>
        );
      },
    },
  ];
}

export default function BillsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [bills, setBills] = useState<Bill[]>([]);
  const [allBills, setAllBills] = useState<Bill[]>([]);
  const [countsData, setCountsData] = useState<{ counts: Record<string, { count: number; amount: number }>; total: number } | null>(null);
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
  const sentinelRef = useRef<HTMLDivElement>(null);

  useDocumentTitle("Purchases · Bills");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
  const columns = useMemo(() => buildColumns(), []);

  // Build params (shared between page 1 fetch and loadMore)
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

  // Fetch status counts + all bills for overview (once, not affected by filters)
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetch(`/api/v1/bills/counts`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.counts) setCountsData(data);
      });
    fetch(`/api/v1/bills?limit=200`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.data) setAllBills(data.data);
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

    fetch(`/api/v1/bills?${buildParams(1)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.data) setBills(data.data);
        if (data.pagination) {

          setHasMore(data.pagination.page < data.pagination.totalPages);
        }
      })
      .then(() => devDelay())
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

    fetch(`/api/v1/bills?${buildParams(nextPage)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setBills((prev) => [...prev, ...data.data]);
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

  const outstanding = useMemo(() => {
    if (!countsData) return 0;
    return ["received", "partial", "overdue"].reduce(
      (s, st) => s + (countsData.counts[st]?.amount || 0), 0
    );
  }, [countsData]);

  const overdue = countsData?.counts.overdue?.amount || 0;

  const aging = useMemo(() => {
    const now = new Date();
    const buckets = {
      current: { count: 0, amount: 0 },
      "1-30": { count: 0, amount: 0 },
      "31-60": { count: 0, amount: 0 },
      "60+": { count: 0, amount: 0 },
    };
    allBills
      .filter(
        (b) =>
          ["received", "partial", "overdue"].includes(b.status) &&
          b.amountDue > 0
      )
      .forEach((bill) => {
        const due = new Date(bill.dueDate);
        const days = Math.floor(
          (now.getTime() - due.getTime()) / 86400000
        );
        if (days <= 0) {
          buckets.current.count++;
          buckets.current.amount += bill.amountDue;
        } else if (days <= 30) {
          buckets["1-30"].count++;
          buckets["1-30"].amount += bill.amountDue;
        } else if (days <= 60) {
          buckets["31-60"].count++;
          buckets["31-60"].amount += bill.amountDue;
        } else {
          buckets["60+"].count++;
          buckets["60+"].amount += bill.amountDue;
        }
      });
    return buckets;
  }, [allBills]);

  // Bills due within 7 days (not paid/void/draft)
  const dueSoon = useMemo(() => {
    const now = new Date();
    return allBills
      .filter((b) => {
        if (["paid", "void", "draft"].includes(b.status)) return false;
        const due = new Date(b.dueDate);
        const days = Math.ceil((due.getTime() - now.getTime()) / 86400000);
        return days >= 0 && days <= 7;
      })
      .sort(
        (a, b) =>
          new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      )
      .slice(0, 5);
  }, [allBills]);

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

  if (loading) return <BrandLoader />;

  if (!loading && (countsData?.total || 0) === 0 && statusFilter === "all" && !debouncedSearch && !hasFilters) {
    return (
      <ContentReveal>
        <div className="relative">
          {/* Background skeleton table */}
          <div className="pointer-events-none w-full rounded-lg border overflow-hidden">
            <div className="flex items-center gap-4 border-b bg-muted/50 px-4 h-10">
              <div className="h-2 w-16 rounded bg-muted-foreground/20" />
              <div className="h-2 w-24 rounded bg-muted-foreground/20" />
              <div className="h-2 w-14 rounded bg-muted-foreground/20 hidden sm:block" />
              <div className="h-2 w-14 rounded bg-muted-foreground/20 hidden sm:block" />
              <div className="ml-auto h-2 w-16 rounded bg-muted-foreground/20" />
              <div className="h-2 w-16 rounded bg-muted-foreground/20" />
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b last:border-0 px-4 h-12">
                <div className={`h-2.5 rounded bg-muted ${i % 3 === 0 ? "w-20" : i % 3 === 1 ? "w-16" : "w-24"}`} />
                <div className={`h-2.5 rounded bg-muted/70 flex-1 max-w-[140px] ${i % 2 === 0 ? "max-w-[160px]" : "max-w-[120px]"}`} />
                <div className="h-2.5 w-20 rounded bg-muted/50 hidden sm:block" />
                <div className="h-2.5 w-20 rounded bg-muted/50 hidden sm:block" />
                <div className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium hidden sm:block ${
                  i % 4 === 0 ? "bg-blue-100 text-blue-400 dark:bg-blue-900/40 dark:text-blue-500" :
                  i % 4 === 1 ? "bg-amber-100 text-amber-400 dark:bg-amber-900/40 dark:text-amber-500" :
                  i % 4 === 2 ? "bg-emerald-100 text-emerald-400 dark:bg-emerald-900/40 dark:text-emerald-500" :
                  "bg-red-100 text-red-400 dark:bg-red-900/40 dark:text-red-500"
                }`}>
                  {i % 4 === 0 ? "received" : i % 4 === 1 ? "partial" : i % 4 === 2 ? "paid" : "overdue"}
                </div>
                <div className={`h-2.5 rounded bg-muted/40 ${i % 2 === 0 ? "w-16" : "w-14"}`} />
                <div className={`h-2.5 rounded bg-muted/40 ${i % 2 === 0 ? "w-14" : "w-16"}`} />
              </div>
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-content-bg/20 via-content-bg/70 to-content-bg" />

          {/* CTA overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/50">
              <ShoppingCart className="size-7 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="mt-5 text-xl font-semibold tracking-tight">
              Track your payables
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
              Add bills from your suppliers to keep track of what you owe, when
              it&apos;s due, and how your payables age over time.
            </p>
            <Button
              onClick={() => openDrawer("bill")}
              size="lg"
              className="mt-6 bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Bill
            </Button>
          </div>
        </div>

        {/* Feature cards - full width */}
        <div className="grid gap-4 sm:grid-cols-3 mt-8">
          {[
            {
              icon: Clock,
              title: "Aging tracking",
              desc: "See how long bills have been outstanding with automatic aging buckets.",
              color: "text-amber-600 dark:text-amber-400",
              bg: "bg-amber-50 dark:bg-amber-950/40",
            },
            {
              icon: AlertTriangle,
              title: "Overdue alerts",
              desc: "Bills approaching or past their due date are highlighted so you never miss a payment.",
              color: "text-red-600 dark:text-red-400",
              bg: "bg-red-50 dark:bg-red-950/40",
            },
            {
              icon: CheckCircle2,
              title: "Payment matching",
              desc: "Record payments against bills and track outstanding balances automatically.",
              color: "text-emerald-600 dark:text-emerald-400",
              bg: "bg-emerald-50 dark:bg-emerald-950/40",
            },
          ].map(({ icon: Icon, title, desc, color, bg }) => (
            <div key={title} className="rounded-xl p-5">
              <div className={`flex size-9 items-center justify-center rounded-lg ${bg}`}>
                <Icon className={`size-4.5 ${color}`} />
              </div>
              <h3 className="mt-3 text-[13px] font-semibold">{title}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </ContentReveal>
    );
  }

  const agingTotal =
    aging.current.amount +
    aging["1-30"].amount +
    aging["31-60"].amount +
    aging["60+"].amount;

  return (
    <ContentReveal className="space-y-10">
      {/* Overview */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Hero stats row */}
        <div className="px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total Outstanding</p>
              <p className="mt-1 text-3xl sm:text-4xl font-bold font-mono tabular-nums tracking-tighter">
                {formatMoney(outstanding)}
              </p>
            </div>
            <div className="flex gap-6 sm:gap-8">
              <div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-red-500" />Overdue
                </p>
                <p className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-red-600 dark:text-red-400">
                  {formatMoney(overdue)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Bills</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{countsData?.total || 0}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-500" />Paid
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {statusCounts.paid || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Aging bar + legend */}
        {agingTotal > 0 && (
          <div className="border-t px-5 py-4 sm:px-6">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">Aging</p>
            <div className="h-2.5 w-full rounded-full overflow-hidden flex mb-3">
              {([
                { key: "current" as const, color: "bg-emerald-500" },
                { key: "1-30" as const, color: "bg-amber-400" },
                { key: "31-60" as const, color: "bg-orange-500" },
                { key: "60+" as const, color: "bg-red-500" },
              ] as const).map(({ key, color }) => {
                const pct = (aging[key].amount / agingTotal) * 100;
                if (pct === 0) return null;
                return <div key={key} className={`${color} h-full first:rounded-l-full last:rounded-r-full`} style={{ width: `${pct}%` }} />;
              })}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
              {([
                { key: "current" as const, color: "bg-emerald-500", label: "Current" },
                { key: "1-30" as const, color: "bg-amber-400", label: "1-30 days" },
                { key: "31-60" as const, color: "bg-orange-500", label: "31-60 days" },
                { key: "60+" as const, color: "bg-red-500", label: "60+ days" },
              ] as const).map(({ key, color, label }) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`size-2 rounded-full ${color}`} />
                    {label}
                  </div>
                  <p className="text-xs font-mono font-medium tabular-nums">
                    {formatMoney(aging[key].amount)}
                    <span className="text-muted-foreground font-normal ml-1.5">({aging[key].count})</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Due soon */}
        {dueSoon.length > 0 && (
          <div className="border-t px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Due within 7 days
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {dueSoon.map((b) => {
                const due = new Date(b.dueDate);
                const now = new Date();
                const days = Math.ceil((due.getTime() - now.getTime()) / 86400000);
                return (
                  <button
                    key={b.id}
                    onClick={() => router.push(`/purchases/${b.id}`)}
                    className="flex items-center gap-3 rounded-lg border bg-background/50 px-3 py-2 text-left hover:bg-accent transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-medium">{b.billNumber}</p>
                      <p className="text-[11px] text-muted-foreground truncate max-w-[120px]">
                        {b.contact?.name || "No supplier"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono font-semibold tabular-nums">
                        {formatMoney(b.amountDue)}
                      </p>
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      <Section title="Bills" description="View, filter, and manage all your bills.">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
              <Tabs value={statusFilter} onValueChange={setStatusFilter}>
                <TabsList>
                  <TabsTrigger value="all" className="whitespace-nowrap">All ({countsData?.total || 0})</TabsTrigger>
                  <TabsTrigger value="draft" className="whitespace-nowrap">Draft ({statusCounts.draft || 0})</TabsTrigger>
                  <TabsTrigger value="received" className="whitespace-nowrap">Received ({statusCounts.received || 0})</TabsTrigger>
                  <TabsTrigger value="partial" className="whitespace-nowrap">Partial ({statusCounts.partial || 0})</TabsTrigger>
                  <TabsTrigger value="paid" className="whitespace-nowrap">Paid ({statusCounts.paid || 0})</TabsTrigger>
                  <TabsTrigger value="overdue" className="whitespace-nowrap">Overdue ({statusCounts.overdue || 0})</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <Button
              onClick={() => openDrawer("bill")}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Bill
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search bills..."
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
                <SelectItem value="due:asc">Due soonest</SelectItem>
                <SelectItem value="due:desc">Due latest</SelectItem>
                <SelectItem value="total:desc">Highest amount</SelectItem>
                <SelectItem value="total:asc">Lowest amount</SelectItem>
                <SelectItem value="amountDue:desc">Highest balance</SelectItem>
                <SelectItem value="number:desc">Number (desc)</SelectItem>
                <SelectItem value="number:asc">Number (asc)</SelectItem>
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
                  data={bills}
                  loading={loading}
                  emptyMessage="No bills match your filters."
                  onRowClick={(r) => router.push(`/purchases/${r.id}`)}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
              </motion.div>
            </MotionConfig>
          )}

          {hasMore && !refetching && (
            <div ref={sentinelRef} className="flex items-center justify-center py-6">
              {loadingMore && (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              )}
            </div>
          )}
        </div>
      </Section>
    </ContentReveal>
  );
}

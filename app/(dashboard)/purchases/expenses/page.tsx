"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Receipt, Search, X } from "lucide-react";
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
import { BlurReveal } from "@/components/ui/blur-reveal";
import { motion, MotionConfig } from "motion/react";

interface ExpenseClaim {
  id: string;
  title: string;
  status: string;
  totalAmount: number;
  currencyCode: string;
  createdAt: string;
  submittedAt: string | null;
  submittedByUser: { name: string | null; email: string } | null;
}

const statusColors: Record<string, string> = {
  draft: "",
  submitted:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  approved:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
  paid: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300",
};

function buildColumns(): Column<ExpenseClaim>[] {
  return [
    {
      key: "title",
      header: "Title",
      sortKey: "title",
      render: (r) => <span className="text-sm font-medium">{r.title}</span>,
    },
    {
      key: "submittedBy",
      header: "Submitted By",
      render: (r) => (
        <span className="text-sm">
          {r.submittedByUser?.name || r.submittedByUser?.email || "-"}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      sortKey: "date",
      className: "w-28",
      render: (r) => (
        <span className="text-sm">
          {new Date(r.createdAt).toLocaleDateString()}
        </span>
      ),
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
      header: "Amount",
      sortKey: "total",
      className: "w-28 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {formatMoney(r.totalAmount, r.currencyCode)}
        </span>
      ),
    },
  ];
}

export default function ExpensesPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("created");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fetchKey, setFetchKey] = useState(0);

  const columns = useMemo(() => buildColumns(), []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sortBy !== "created") params.set("sortBy", sortBy);
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    fetch(`/api/v1/expenses?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.data) setClaims(data.data);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setFetchKey((k) => k + 1);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, debouncedSearch, sortBy, sortOrder, dateFrom, dateTo]);

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

  const totalAmount = claims.reduce((s, c) => s + c.totalAmount, 0);
  const pendingAmount = claims
    .filter((c) => c.status === "submitted")
    .reduce((s, c) => s + c.totalAmount, 0);
  const approvedAmount = claims
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + c.totalAmount, 0);

  const statusCounts = useMemo(() => {
    const map: Record<string, { count: number; amount: number }> = {};
    for (const c of claims) {
      if (!map[c.status]) map[c.status] = { count: 0, amount: 0 };
      map[c.status].count++;
      map[c.status].amount += c.totalAmount;
    }
    return map;
  }, [claims]);

  if (loading) return <BrandLoader />;

  if (claims.length === 0 && statusFilter === "all" && !debouncedSearch) {
    return (
      <BlurReveal>
        <div>
          {/* Full-width pipeline steps */}
          <div className="grid grid-cols-4 gap-0 rounded-lg border overflow-hidden mb-8">
            {[
              { label: "Draft", desc: "Create expense claim", color: "bg-gray-400", bg: "bg-gray-50 dark:bg-gray-900/30" },
              { label: "Submitted", desc: "Submit for review", color: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20" },
              { label: "Approved", desc: "Manager approves", color: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
              { label: "Paid", desc: "Reimbursement sent", color: "bg-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20" },
            ].map(({ label, desc, color, bg }, i) => (
              <div key={label} className={`relative flex flex-col items-center py-6 px-3 text-center border-r last:border-r-0 ${bg}`}>
                <div className={`absolute top-0 left-0 right-0 h-1 ${color} opacity-30`} />
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-muted-foreground/50 tabular-nums">{i + 1}</span>
                  <div className={`size-2.5 rounded-full ${color}`} />
                </div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
              </div>
            ))}
          </div>

          {/* Skeleton table background with overlay */}
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
                <div key={i} className="flex items-center gap-4 border-b last:border-0 px-4 h-12">
                  <div className={`h-2.5 rounded bg-muted flex-1 max-w-[200px] ${i % 2 === 0 ? "max-w-[180px]" : "max-w-[220px]"}`} />
                  <div className={`h-2.5 rounded bg-muted/60 ${i % 2 === 0 ? "w-24" : "w-20"} hidden sm:block`} />
                  <div className="h-2.5 w-20 rounded bg-muted/50 hidden sm:block" />
                  <div className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium hidden sm:block ${
                    i % 3 === 0 ? "bg-blue-100 text-blue-400 dark:bg-blue-900/40 dark:text-blue-500" :
                    i % 3 === 1 ? "bg-emerald-100 text-emerald-400 dark:bg-emerald-900/40 dark:text-emerald-500" :
                    "bg-purple-100 text-purple-400 dark:bg-purple-900/40 dark:text-purple-500"
                  }`}>
                    {i % 3 === 0 ? "submitted" : i % 3 === 1 ? "approved" : "paid"}
                  </div>
                  <div className={`h-2.5 rounded bg-muted/40 ${i % 2 === 0 ? "w-16" : "w-14"}`} />
                </div>
              ))}
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-content-bg/20 via-content-bg/70 to-content-bg" />

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-purple-100 dark:bg-purple-950/50">
                <Receipt className="size-7 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="mt-5 text-xl font-semibold tracking-tight">
                No expense claims yet
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
                Submit expenses and track them through approval to reimbursement.
              </p>
              <Button
                onClick={() => openDrawer("expense")}
                size="lg"
                className="mt-6 bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="mr-2 size-4" />
                New Expense Claim
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
        {/* Header */}
        <PageHeader
          title="Expenses"
          description="Submit and manage expense claims through approval."
        >
          <Button
            size="sm"
            onClick={() => openDrawer("expense")}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New Expense
          </Button>
        </PageHeader>

        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold font-mono tabular-nums tracking-tight">
              {formatMoney(totalAmount)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-blue-500" />
              Pending
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums tracking-tight text-blue-600 dark:text-blue-400">
              {formatMoney(pendingAmount)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Approved
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatMoney(approvedAmount)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Claims</p>
            <p className="text-2xl font-bold tabular-nums tracking-tight">
              {claims.length}
            </p>
          </div>
        </div>

        {/* Status pipeline badges */}
        {claims.length > 0 && (
          <div className="flex gap-2">
            {(
              [
                { status: "draft", label: "Draft", color: "bg-gray-400" },
                { status: "submitted", label: "Submitted", color: "bg-blue-500" },
                { status: "approved", label: "Approved", color: "bg-emerald-500" },
                { status: "rejected", label: "Rejected", color: "bg-red-500" },
                { status: "paid", label: "Paid", color: "bg-purple-500" },
              ] as const
            ).map(({ status, label, color }) => {
              const data = statusCounts[status];
              if (!data) return null;
              return (
                <div
                  key={status}
                  className="flex items-center gap-2 rounded-md border px-3 py-1.5"
                >
                  <span className={`size-2 rounded-full ${color}`} />
                  <span className="text-xs font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {data.count}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="h-px bg-border" />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="submitted">Submitted</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search expenses..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

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
              <SelectItem value="title:asc">Title (A-Z)</SelectItem>
              <SelectItem value="title:desc">Title (Z-A)</SelectItem>
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
        {pendingSearch ? (
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
                data={claims}
                loading={loading}
                emptyMessage="No expense claims match your filters."
                onRowClick={(r) =>
                  router.push(`/purchases/expenses/${r.id}`)
                }
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
            </motion.div>
          </MotionConfig>
        )}
      </div>
    </BlurReveal>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  ArrowLeftRight,
  BookOpen,
  BarChart3,
  Search,
  X,
  CheckCircle2,
  FileEdit,
  Ban,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/dashboard/data-table";
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
import { ActivityFeed } from "@/components/dashboard/activity-feed";

interface Entry {
  id: string;
  entryNumber: number;
  date: string;
  description: string;
  reference: string | null;
  status: "draft" | "posted" | "void";
  totalDebit: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  posted:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  draft: "",
  void: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

const columns: Column<Entry>[] = [
  {
    key: "number",
    header: "#",
    className: "w-16",
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground">
        {r.entryNumber}
      </span>
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
    render: (r) => (
      <div>
        <p className="text-sm font-medium">{r.description}</p>
        {r.reference && (
          <p className="text-xs text-muted-foreground">{r.reference}</p>
        )}
      </div>
    ),
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
    key: "amount",
    header: "Amount",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {formatMoney(Math.round(parseFloat(r.totalDebit) * 100))}
      </span>
    ),
  },
];

export default function TransactionsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("date:desc");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/entries", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.entries) setEntries(data.entries);
      })
      .then(() => devDelay())
      .finally(() => setLoading(false));
  }, []);

  const posted = entries.filter((e) => e.status === "posted");
  const drafts = entries.filter((e) => e.status === "draft");
  const voids = entries.filter((e) => e.status === "void");
  const totalPosted = posted.reduce(
    (sum, e) => sum + Math.round(parseFloat(e.totalDebit) * 100),
    0
  );

  const filtered = useMemo(() => {
    let result = entries;

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((e) => e.status === statusFilter);
    }

    // Search filter
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (e) =>
          e.description.toLowerCase().includes(q) ||
          (e.reference || "").toLowerCase().includes(q) ||
          String(e.entryNumber).includes(q)
      );
    }

    // Date range filter
    if (dateFrom) {
      result = result.filter((e) => e.date >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((e) => e.date <= dateTo);
    }

    // Sort
    const [key, order] = sortBy.split(":");
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (key === "date") {
        cmp = a.date.localeCompare(b.date);
      } else if (key === "number") {
        cmp = a.entryNumber - b.entryNumber;
      } else if (key === "amount") {
        cmp = parseFloat(a.totalDebit) - parseFloat(b.totalDebit);
      }
      return order === "asc" ? cmp : -cmp;
    });

    return result;
  }, [entries, statusFilter, debouncedSearch, dateFrom, dateTo, sortBy]);

  const hasFilters = search || dateFrom || dateTo;
  const pendingSearch = search !== debouncedSearch;

  const [contentKey, setContentKey] = useState(0);
  useEffect(() => {
    setContentKey((k) => k + 1);
  }, [debouncedSearch, statusFilter, sortBy]);

  if (loading) return <BrandLoader />;

  if (!loading && entries.length === 0) {
    return (
      <ContentReveal className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Journal Entries
          </h2>
          <Button
            onClick={() => openDrawer("entry")}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New Entry
          </Button>
        </div>

        <div className="flex flex-col items-center gap-10 pt-8 pb-12">
          {/* Entry lifecycle stepper */}
          <div className="w-full max-w-xl">
            <div className="grid grid-cols-3 gap-0">
              {[
                {
                  step: "1",
                  icon: BookOpen,
                  label: "Set up accounts",
                  sub: "Define your chart of accounts and categories",
                  color: "bg-blue-500",
                  ring: "ring-blue-200 dark:ring-blue-900",
                },
                {
                  step: "2",
                  icon: ArrowLeftRight,
                  label: "Record entries",
                  sub: "Create journal entries with balanced debits and credits",
                  color: "bg-amber-500",
                  ring: "ring-amber-200 dark:ring-amber-900",
                },
                {
                  step: "3",
                  icon: BarChart3,
                  label: "Generate reports",
                  sub: "View trial balance, income statement, and more",
                  color: "bg-emerald-500",
                  ring: "ring-emerald-200 dark:ring-emerald-900",
                },
              ].map(({ step, icon: StepIcon, label, sub, color, ring }, i) => (
                <div
                  key={step}
                  className="flex flex-col items-center text-center relative"
                >
                  {i < 2 && (
                    <div className="absolute top-4 left-[calc(50%+16px)] w-[calc(100%-32px)] h-px bg-border" />
                  )}
                  <div
                    className={`relative z-10 flex size-8 items-center justify-center rounded-full ${color} ring-4 ${ring} text-white text-xs font-bold`}
                  >
                    {step}
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <StepIcon className="size-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium">{label}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground max-w-[150px] leading-relaxed">
                    {sub}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-tight">
              Start tracking transactions
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Create your first journal entry to begin recording transactions.
            </p>
            <Button
              onClick={() => openDrawer("entry")}
              size="lg"
              className="mt-5 bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Entry
            </Button>
          </div>

          {/* Preview stat cards (empty) */}
          <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-3 gap-3 opacity-40">
            {[
              { label: "Total Posted", value: "$0.00" },
              { label: "Posted Entries", value: "0" },
              { label: "Drafts", value: "0" },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-lg border border-dashed p-3 text-center"
              >
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-sm font-mono font-medium text-muted-foreground">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      {/* Inline stats row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {/* Total Posted */}
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Total Posted
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {formatMoney(totalPosted)}
            </p>
          </div>

          {/* Posted count */}
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <CheckCircle2 className="size-3 text-emerald-500" />
              Posted
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {posted.length}
            </p>
          </div>

          {/* Drafts count */}
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <FileEdit className="size-3 text-amber-500" />
              Drafts
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {drafts.length}
            </p>
          </div>

          {/* Void count */}
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Ban className="size-3 text-red-500" />
              Void
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
              {voids.length}
            </p>
          </div>
        </div>

        <Button
          onClick={() => openDrawer("entry")}
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
        >
          <Plus className="mr-2 size-4" />
          New Entry
        </Button>
      </div>

      <div className="h-px bg-border" />

      {/* Main content + activity feed */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {/* Status filter tabs with counts */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList className="overflow-x-auto">
                <TabsTrigger value="all" className="whitespace-nowrap">
                  All{" "}
                  <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">
                    {entries.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="posted" className="whitespace-nowrap">
                  Posted{" "}
                  <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">
                    {posted.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="draft" className="whitespace-nowrap">
                  Draft{" "}
                  <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">
                    {drafts.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="void" className="whitespace-nowrap">
                  Void{" "}
                  <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">
                    {voids.length}
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Filter bar: search, date range, sort */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search entries..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-56 pl-8 text-xs"
              />
            </div>
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
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date:desc">Newest first</SelectItem>
                <SelectItem value="date:asc">Oldest first</SelectItem>
                <SelectItem value="number:desc">Entry # (desc)</SelectItem>
                <SelectItem value="number:asc">Entry # (asc)</SelectItem>
                <SelectItem value="amount:desc">Highest amount</SelectItem>
                <SelectItem value="amount:asc">Lowest amount</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => {
                  setSearch("");
                  setDebouncedSearch("");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                <X className="mr-1 size-3" />
                Clear filters
              </Button>
            )}
          </div>

          {/* Table */}
          {pendingSearch ? (
            <BrandLoader className="h-48" />
          ) : (
            <ContentReveal key={contentKey}>
              <DataTable
                columns={columns}
                data={filtered}
                loading={false}
                emptyMessage={
                  hasFilters || statusFilter !== "all"
                    ? "No entries match your filters."
                    : "No entries found."
                }
                onRowClick={(r) => router.push(`/accounting/${r.id}`)}
              />
            </ContentReveal>
          )}

          {/* Count */}
          {!pendingSearch && filtered.length > 0 && (
            <p className="text-xs text-muted-foreground pt-1">
              Showing {filtered.length} of {entries.length} entr
              {entries.length !== 1 ? "ies" : "y"}
            </p>
          )}
        </div>

        {/* Activity feed sidebar */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <ActivityFeed />
        </div>
      </div>
    </ContentReveal>
  );
}

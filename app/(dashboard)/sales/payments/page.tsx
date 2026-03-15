"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import Link from "next/link";
import { ArrowLeft, Banknote, Search, X } from "lucide-react";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
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
import { EmptyState } from "@/components/dashboard/empty-state";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";

interface Payment {
  id: string;
  paymentNumber: string;
  date: string;
  amount: number;
  method: string;
  reference: string | null;
  contact: { name: string } | null;
  allocations: { documentType: string; documentId: string; amount: number }[];
}

const methodLabels: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  check: "Check",
  card: "Card",
  other: "Other",
};

const methodColors: Record<string, string> = {
  bank_transfer: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  cash: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  check: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  card: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300",
  other: "",
};

function buildColumns(): Column<Payment>[] {
  return [
    {
      key: "number",
      header: "Number",
      sortKey: "number",
      className: "w-32",
      render: (r) => <span className="font-mono text-sm">{r.paymentNumber}</span>,
    },
    {
      key: "contact",
      header: "Customer",
      render: (r) => <span className="text-sm font-medium">{r.contact?.name || "-"}</span>,
    },
    {
      key: "date",
      header: "Date",
      sortKey: "date",
      className: "w-28",
      render: (r) => <span className="text-sm">{r.date}</span>,
    },
    {
      key: "method",
      header: "Method",
      className: "w-32",
      render: (r) => (
        <Badge variant="outline" className={methodColors[r.method] || ""}>
          {methodLabels[r.method] || r.method}
        </Badge>
      ),
    },
    {
      key: "reference",
      header: "Reference",
      className: "w-32",
      render: (r) => <span className="text-sm text-muted-foreground">{r.reference || "-"}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      sortKey: "amount",
      className: "w-28 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums font-medium text-emerald-600">
          {formatMoney(r.amount)}
        </span>
      ),
    },
    {
      key: "allocations",
      header: "Allocations",
      className: "w-28",
      render: (r) => {
        const count = r.allocations?.length || 0;
        return (
          <span className="text-sm text-muted-foreground">
            {count === 0 ? "-" : `${count} invoice${count !== 1 ? "s" : ""}`}
          </span>
        );
      },
    },
  ];
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  useDocumentTitle("Sales · Payments");

  const [methodFilter, setMethodFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const columns = useMemo(() => buildColumns(), []);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/payments?type=received`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setPayments(data.data);
      })
      .then(() => devDelay())
      .finally(() => setLoading(false));
  }, []);

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

  const [filterKey, setFilterKey] = useState(0);

  const filtered = useMemo(() => {
    let result = payments;

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.paymentNumber.toLowerCase().includes(q) ||
          (p.contact?.name || "").toLowerCase().includes(q) ||
          (p.reference || "").toLowerCase().includes(q)
      );
    }

    if (methodFilter !== "all") {
      result = result.filter((p) => p.method === methodFilter);
    }

    if (dateFrom) {
      result = result.filter((p) => p.date >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((p) => p.date <= dateTo);
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "date") cmp = a.date.localeCompare(b.date);
      else if (sortBy === "amount") cmp = a.amount - b.amount;
      else if (sortBy === "number") cmp = a.paymentNumber.localeCompare(b.paymentNumber);
      return sortOrder === "desc" ? -cmp : cmp;
    });

    return result;
  }, [payments, debouncedSearch, methodFilter, dateFrom, dateTo, sortBy, sortOrder]);

  // Bump filterKey when filters change to trigger ContentReveal
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilterKey((k) => k + 1);
  }, [debouncedSearch, methodFilter, dateFrom, dateTo]);

  const totalAmount = filtered.reduce((sum, p) => sum + p.amount, 0);
  const hasFilters = search || methodFilter !== "all" || dateFrom || dateTo;

  if (loading) return <BrandLoader />;

  if (!loading && payments.length === 0) {
    return (
      <ContentReveal className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <Link href="/sales"><ArrowLeft className="size-4" /></Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Payments</h1>
            <p className="text-sm text-muted-foreground">Payments received against your invoices.</p>
          </div>
        </div>
        <EmptyState
          icon={Banknote}
          title="No payments recorded"
          description="Payments will appear here when you record them against invoices."
        />
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <Link href="/sales"><ArrowLeft className="size-4" /></Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Payments</h1>
            <p className="text-sm text-muted-foreground">Payments received against your invoices.</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Total Received" value={formatMoney(totalAmount)} icon={Banknote} changeType="positive" />
        <StatCard title="Payments" value={filtered.length.toString()} icon={Banknote} />
        <StatCard
          title="Avg Payment"
          value={filtered.length > 0 ? formatMoney(Math.round(totalAmount / filtered.length)) : "$0.00"}
          icon={Banknote}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search payments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-56 pl-8 text-xs"
          />
        </div>
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="check">Check</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
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
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date:desc">Newest first</SelectItem>
            <SelectItem value="date:asc">Oldest first</SelectItem>
            <SelectItem value="amount:desc">Highest amount</SelectItem>
            <SelectItem value="amount:asc">Lowest amount</SelectItem>
            <SelectItem value="number:desc">Number (desc)</SelectItem>
            <SelectItem value="number:asc">Number (asc)</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => { setSearch(""); setMethodFilter("all"); setDateFrom(""); setDateTo(""); }}
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
        <ContentReveal key={filterKey}>
          <DataTable
            columns={columns}
            data={filtered}
            loading={false}
            emptyMessage="No payments match your filters."
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        </ContentReveal>
      )}
    </ContentReveal>
  );
}

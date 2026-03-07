"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileText, X, Banknote } from "lucide-react";
import { Section } from "@/components/dashboard/section";
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

interface Invoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  total: number;
  amountDue: number;
  contact: { name: string } | null;
}

interface PaymentRecord {
  id: string;
  paymentNumber: string;
  date: string;
  amount: number;
  method: string;
  contact: { name: string } | null;
  allocations: { documentType: string; documentId: string; amount: number }[];
}

const statusColors: Record<string, string> = {
  draft: "",
  sent: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  partial: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  overdue: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

const methodLabels: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  check: "Check",
  card: "Card",
  other: "Other",
};

function getOverdueInfo(dueDate: string, status: string) {
  if (status === "paid" || status === "void" || status === "draft") return null;
  const now = new Date();
  const due = new Date(dueDate);
  const diffMs = now.getTime() - due.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) {
    const daysLeft = Math.abs(days);
    if (daysLeft === 0) return { label: "Due today", color: "text-amber-600" };
    if (daysLeft <= 7) return { label: `Due in ${daysLeft}d`, color: "text-muted-foreground" };
    return null;
  }
  if (days <= 30) return { label: `${days}d overdue`, color: "text-red-500" };
  if (days <= 90) return { label: `${days}d overdue`, color: "text-red-600 font-medium" };
  return { label: `${days}d overdue`, color: "text-red-700 font-semibold" };
}

function buildColumns(): Column<Invoice>[] {
  return [
    {
      key: "number",
      header: "Number",
      sortKey: "number",
      className: "w-32",
      render: (r) => <span className="font-mono text-sm">{r.invoiceNumber}</span>,
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
      render: (r) => <span className="text-sm">{r.issueDate}</span>,
    },
    {
      key: "due",
      header: "Due",
      sortKey: "due",
      className: "w-36",
      render: (r) => {
        const info = getOverdueInfo(r.dueDate, r.status);
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
        <span className="font-mono text-sm tabular-nums">{formatMoney(r.total)}</span>
      ),
    },
    {
      key: "due-amount",
      header: "Balance",
      sortKey: "amountDue",
      className: "w-28 text-right",
      render: (r) => {
        const color = r.amountDue < 0
          ? "text-emerald-600"
          : r.amountDue > 0 && r.status !== "draft"
            ? "text-amber-600"
            : "";
        return (
          <span className={`font-mono text-sm tabular-nums ${color}`}>
            {formatMoney(r.amountDue)}
          </span>
        );
      },
    },
  ];
}

export default function InvoicesPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const columns = useMemo(() => buildColumns(), []);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (sortBy !== "created") params.set("sortBy", sortBy);
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    params.set("limit", "200");

    fetch(`/api/v1/invoices?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.data) setInvoices(data.data);
      })
      .then(() => devDelay())
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [orgId, statusFilter, sortBy, sortOrder, dateFrom, dateTo]);

  // Fetch recent payments separately
  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/payments?type=received&limit=5`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setPayments(data.data);
      });
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

  const hasFilters = dateFrom || dateTo;

  const outstanding = invoices
    .filter((i) => ["sent", "partial", "overdue"].includes(i.status))
    .reduce((sum, i) => sum + i.amountDue, 0);

  const overdue = invoices
    .filter((i) => i.status === "overdue")
    .reduce((sum, i) => sum + i.amountDue, 0);

  const aging = useMemo(() => {
    const now = new Date();
    const buckets = {
      current: { count: 0, amount: 0 },
      "1-30": { count: 0, amount: 0 },
      "31-60": { count: 0, amount: 0 },
      "60+": { count: 0, amount: 0 },
    };
    invoices
      .filter((i) => ["sent", "partial", "overdue"].includes(i.status) && i.amountDue > 0)
      .forEach((inv) => {
        const due = new Date(inv.dueDate);
        const days = Math.floor((now.getTime() - due.getTime()) / 86400000);
        if (days <= 0) { buckets.current.count++; buckets.current.amount += inv.amountDue; }
        else if (days <= 30) { buckets["1-30"].count++; buckets["1-30"].amount += inv.amountDue; }
        else if (days <= 60) { buckets["31-60"].count++; buckets["31-60"].amount += inv.amountDue; }
        else { buckets["60+"].count++; buckets["60+"].amount += inv.amountDue; }
      });
    return buckets;
  }, [invoices]);

  const agingTotal = aging.current.amount + aging["1-30"].amount + aging["31-60"].amount + aging["60+"].amount;

  if (loading && invoices.length === 0) return <BrandLoader />;

  if (!loading && invoices.length === 0 && statusFilter === "all" && !hasFilters) {
    return (
      <ContentReveal>
        <div className="flex flex-col items-center gap-10 pt-16 pb-12">
          {/* Invoice lifecycle stepper */}
          <div className="w-full max-w-xl">
            <div className="grid grid-cols-3 gap-0">
              {[
                { step: "1", label: "Create", sub: "Draft your invoice with line items and pricing", color: "bg-blue-500", ring: "ring-blue-200 dark:ring-blue-900" },
                { step: "2", label: "Send", sub: "Email it directly to your customer", color: "bg-amber-500", ring: "ring-amber-200 dark:ring-amber-900" },
                { step: "3", label: "Get paid", sub: "Track payments and outstanding balances", color: "bg-emerald-500", ring: "ring-emerald-200 dark:ring-emerald-900" },
              ].map(({ step, label, sub, color, ring }, i) => (
                <div key={step} className="flex flex-col items-center text-center relative">
                  {i < 2 && (
                    <div className="absolute top-4 left-[calc(50%+16px)] w-[calc(100%-32px)] h-px bg-border" />
                  )}
                  <div className={`relative z-10 flex size-8 items-center justify-center rounded-full ${color} ring-4 ${ring} text-white text-xs font-bold`}>
                    {step}
                  </div>
                  <p className="mt-3 text-sm font-medium">{label}</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-[150px] leading-relaxed">{sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-tight">Start getting paid</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Create your first invoice to begin tracking revenue.</p>
            <Button
              onClick={() => openDrawer("invoice")}
              size="lg"
              className="mt-5 bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Invoice
            </Button>
          </div>

          {/* Preview stat cards (empty) */}
          <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-3 gap-3 opacity-40">
            {[
              { label: "Outstanding", value: "$0.00" },
              { label: "Overdue", value: "$0.00" },
              { label: "Paid this month", value: "$0.00" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-dashed p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-mono font-medium text-muted-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-10">
      <Section title="Overview" description="Revenue summary and outstanding amounts across all invoices.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard title="Outstanding" value={formatMoney(outstanding)} icon={FileText} />
            <StatCard title="Overdue" value={formatMoney(overdue)} icon={FileText} changeType="negative" />
            <StatCard title="Total Invoices" value={invoices.length.toString()} icon={FileText} />
          </div>
          {agingTotal > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Aging Breakdown</p>
              <div className="h-3 w-full rounded-full overflow-hidden flex">
                {([
                  { key: "current" as const, color: "bg-emerald-500", label: "Current" },
                  { key: "1-30" as const, color: "bg-amber-400", label: "1-30 days" },
                  { key: "31-60" as const, color: "bg-orange-500", label: "31-60 days" },
                  { key: "60+" as const, color: "bg-red-500", label: "60+ days" },
                ] as const).map(({ key, color }) => {
                  const pct = (aging[key].amount / agingTotal) * 100;
                  if (pct === 0) return null;
                  return (
                    <div key={key} className={`${color} h-full`} style={{ width: `${pct}%` }} />
                  );
                })}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  { key: "current" as const, color: "bg-emerald-500", label: "Current" },
                  { key: "1-30" as const, color: "bg-amber-400", label: "1-30 days" },
                  { key: "31-60" as const, color: "bg-orange-500", label: "31-60 days" },
                  { key: "60+" as const, color: "bg-red-500", label: "60+ days" },
                ] as const).map(({ key, color, label }) => (
                  <div key={key} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block size-2 rounded-full ${color}`} />
                      <span className="text-muted-foreground">{label}</span>
                    </div>
                    <p className="font-mono tabular-nums mt-0.5 pl-3.5">
                      {aging[key].count} · {formatMoney(aging[key].amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Invoices" description="View, filter, and manage all your invoices.">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList className="overflow-x-auto">
                <TabsTrigger value="all" className="whitespace-nowrap">All</TabsTrigger>
                <TabsTrigger value="draft" className="whitespace-nowrap">Draft</TabsTrigger>
                <TabsTrigger value="sent" className="whitespace-nowrap">Sent</TabsTrigger>
                <TabsTrigger value="partial" className="whitespace-nowrap">Partial</TabsTrigger>
                <TabsTrigger value="paid" className="whitespace-nowrap">Paid</TabsTrigger>
                <TabsTrigger value="overdue" className="whitespace-nowrap">Overdue</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              onClick={() => openDrawer("invoice")}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Invoice
            </Button>
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
                onClick={() => { setDateFrom(""); setDateTo(""); }}
              >
                <X className="mr-1 size-3" />
                Clear dates
              </Button>
            )}
          </div>

          <DataTable
            columns={columns}
            data={invoices}
            loading={loading}
            emptyMessage="No invoices match your filters."
            onRowClick={(r) => router.push(`/sales/${r.id}`)}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        </div>
      </Section>

      {/* Recent Payments */}
      {payments.length > 0 && (
        <>
          <div className="h-px bg-border" />

          <Section title="Recent Payments" description="Latest payments received against your invoices.">
            <div className="rounded-lg border">
              {payments.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-3 sm:px-4 py-3 ${i < payments.length - 1 ? "border-b" : ""}`}
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="hidden sm:flex size-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40 shrink-0">
                      <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono">{p.paymentNumber}</span>
                        <span className="text-xs text-muted-foreground">{p.contact?.name || "-"}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{p.date}</span>
                        <span className="text-xs text-muted-foreground">{methodLabels[p.method] || p.method}</span>
                        {p.allocations?.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            · {p.allocations.length} invoice{p.allocations.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-mono font-medium text-emerald-600 shrink-0">
                    {formatMoney(p.amount)}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}
    </ContentReveal>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileText } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";

import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { BlurReveal } from "@/components/ui/blur-reveal";


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

const statusColors: Record<string, string> = {
  draft: "",
  sent: "border-blue-200 bg-blue-50 text-blue-700",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  overdue: "border-red-200 bg-red-50 text-red-700",
  void: "border-gray-200 bg-gray-50 text-gray-700",
};

const columns: Column<Invoice>[] = [
  {
    key: "number",
    header: "Number",
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
    className: "w-28",
    render: (r) => <span className="text-sm">{r.issueDate}</span>,
  },
  {
    key: "due",
    header: "Due",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.dueDate}</span>,
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
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">{formatMoney(r.total)}</span>
    ),
  },
  {
    key: "due-amount",
    header: "Due",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">{formatMoney(r.amountDue)}</span>
    ),
  },
];

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);

    fetch(`/api/v1/invoices?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setInvoices(data.data);
      })
      .then(() => devDelay())
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const outstanding = invoices
    .filter((i) => ["sent", "partial", "overdue"].includes(i.status))
    .reduce((sum, i) => sum + i.amountDue, 0);

  const overdue = invoices
    .filter((i) => i.status === "overdue")
    .reduce((sum, i) => sum + i.amountDue, 0);

  const aging = useMemo(() => {
    const now = new Date();
    const buckets = { current: { count: 0, amount: 0 }, "1-30": { count: 0, amount: 0 }, "31-60": { count: 0, amount: 0 }, "60+": { count: 0, amount: 0 } };
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

  if (loading) return <BrandLoader />;

  if (!loading && invoices.length === 0 && statusFilter === "all") {
    return (
      <BlurReveal className="space-y-10">
        <Section title="Invoices" description="Create and send invoices to your customers. Track payments and outstanding balances.">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px] min-h-[50vh]">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
                <FileText className="size-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="mt-4 text-sm font-medium">No invoices yet</h3>
              <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                Create and send professional invoices, then track payments as they come in.
              </p>
              <div className="mt-4">
                <Button
                  onClick={() => router.push("/sales/new")}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus className="mr-2 size-4" />
                  New Invoice
                </Button>
              </div>
            </div>
            <div className="hidden lg:block rounded-lg border border-dashed bg-card p-5 opacity-50">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="h-3 w-24 rounded bg-muted" />
                    <div className="h-2 w-16 rounded bg-muted mt-2" />
                  </div>
                  <div className="text-right">
                    <div className="h-3 w-16 rounded bg-muted ml-auto" />
                    <div className="h-2 w-20 rounded bg-muted mt-2 ml-auto" />
                  </div>
                </div>
                <div className="h-px bg-border" />
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <div className="h-2 w-32 rounded bg-muted" />
                    <div className="h-2 w-14 rounded bg-muted" />
                  </div>
                  <div className="flex justify-between">
                    <div className="h-2 w-28 rounded bg-muted" />
                    <div className="h-2 w-14 rounded bg-muted" />
                  </div>
                  <div className="flex justify-between">
                    <div className="h-2 w-36 rounded bg-muted" />
                    <div className="h-2 w-14 rounded bg-muted" />
                  </div>
                </div>
                <div className="h-px bg-border" />
                <div className="flex justify-between">
                  <div className="h-3 w-12 rounded bg-muted" />
                  <div className="h-3 w-16 rounded bg-emerald-200 dark:bg-emerald-900/40" />
                </div>
              </div>
            </div>
          </div>
        </Section>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal className="space-y-10">
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
              <div className="grid grid-cols-4 gap-2">
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

          <div className="flex justify-end">
            <Button
              onClick={() => router.push("/sales/new")}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Invoice
            </Button>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Invoices" description="View, filter, and manage all your invoices.">
        <div className="space-y-4">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="sent">Sent</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
              <TabsTrigger value="overdue">Overdue</TabsTrigger>
            </TabsList>
          </Tabs>

          <DataTable
              columns={columns}
              data={invoices}
              loading={loading}
              emptyMessage="No invoices found."
              onRowClick={(r) => router.push(`/sales/${r.id}`)}
            />
        </div>
      </Section>
    </BlurReveal>
  );
}

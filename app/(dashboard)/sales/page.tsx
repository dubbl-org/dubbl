"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileText } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
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

  if (loading) return <BrandLoader />;

  if (!loading && invoices.length === 0 && statusFilter === "all") {
    return (
      <BlurReveal className="space-y-10">
        <Section title="Invoices" description="Create and send invoices to your customers. Track payments and outstanding balances.">
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Create your first invoice to start billing customers."
          >
            <Button
              onClick={() => router.push("/sales/new")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Invoice
            </Button>
          </EmptyState>
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

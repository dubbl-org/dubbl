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
import { BlurReveal } from "@/components/ui/blur-reveal";

interface Quote {
  id: string;
  quoteNumber: string;
  issueDate: string;
  expiryDate: string;
  status: string;
  total: number;
  contact: { name: string } | null;
}

const statusColors: Record<string, string> = {
  draft: "",
  sent: "border-blue-200 bg-blue-50 text-blue-700",
  accepted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  declined: "border-red-200 bg-red-50 text-red-700",
  expired: "border-gray-200 bg-gray-50 text-gray-700",
  converted: "border-purple-200 bg-purple-50 text-purple-700",
};

const columns: Column<Quote>[] = [
  {
    key: "number",
    header: "Number",
    className: "w-32",
    render: (r) => <span className="font-mono text-sm">{r.quoteNumber}</span>,
  },
  {
    key: "contact",
    header: "Customer",
    render: (r) => (
      <span className="text-sm font-medium">{r.contact?.name || "-"}</span>
    ),
  },
  {
    key: "date",
    header: "Date",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.issueDate}</span>,
  },
  {
    key: "expiry",
    header: "Expires",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.expiryDate}</span>,
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
      <span className="font-mono text-sm tabular-nums">
        {formatMoney(r.total)}
      </span>
    ),
  },
];

export default function QuotesPage() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);

    fetch(`/api/v1/quotes?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setQuotes(data.data);
      })
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const sent = quotes
    .filter((q) => q.status === "sent")
    .reduce((sum, q) => sum + q.total, 0);

  const accepted = quotes
    .filter((q) => q.status === "accepted")
    .reduce((sum, q) => sum + q.total, 0);

  if (!loading && quotes.length === 0 && statusFilter === "all") {
    return (
      <BlurReveal className="space-y-10">
        <Section title="Quotes" description="Create and send quotes to your customers. Track acceptances and conversions.">
          <EmptyState
            icon={FileText}
            title="No quotes yet"
            description="Create your first quote to send to customers."
          >
            <Button
              onClick={() => router.push("/sales/quotes/new")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Quote
            </Button>
          </EmptyState>
        </Section>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal className="space-y-10">
      <Section title="Overview" description="Quotes summary and pending amounts across all proposals.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard title="Sent" value={formatMoney(sent)} icon={FileText} />
            <StatCard title="Accepted" value={formatMoney(accepted)} icon={FileText} changeType="positive" />
            <StatCard title="Total Quotes" value={quotes.length.toString()} icon={FileText} />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => router.push("/sales/quotes/new")}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Quote
            </Button>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Quotes" description="View, filter, and manage all your quotes.">
        <div className="space-y-4">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="sent">Sent</TabsTrigger>
              <TabsTrigger value="accepted">Accepted</TabsTrigger>
            </TabsList>
          </Tabs>

          <DataTable
            columns={columns}
            data={quotes}
            loading={loading}
            emptyMessage="No quotes found."
            onRowClick={(r) => router.push(`/sales/quotes/${r.id}`)}
          />
        </div>
      </Section>
    </BlurReveal>
  );
}

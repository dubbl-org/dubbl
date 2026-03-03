"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";

interface Bill {
  id: string; billNumber: string; issueDate: string; dueDate: string; status: string;
  total: number; amountDue: number; contact: { name: string } | null;
}

const statusColors: Record<string, string> = {
  draft: "", received: "border-blue-200 bg-blue-50 text-blue-700", partial: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700", overdue: "border-red-200 bg-red-50 text-red-700", void: "border-gray-200 bg-gray-50 text-gray-700",
};

const columns: Column<Bill>[] = [
  { key: "number", header: "Number", className: "w-32", render: (r) => <span className="font-mono text-sm">{r.billNumber}</span> },
  { key: "contact", header: "Supplier", render: (r) => <span className="text-sm font-medium">{r.contact?.name || "-"}</span> },
  { key: "date", header: "Date", className: "w-28", render: (r) => <span className="text-sm">{r.issueDate}</span> },
  { key: "due", header: "Due", className: "w-28", render: (r) => <span className="text-sm">{r.dueDate}</span> },
  { key: "status", header: "Status", className: "w-24", render: (r) => <Badge variant="outline" className={statusColors[r.status] || ""}>{r.status}</Badge> },
  { key: "total", header: "Total", className: "w-28 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{formatMoney(r.total)}</span> },
  { key: "due-amount", header: "Due", className: "w-28 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{formatMoney(r.amountDue)}</span> },
];

export default function BillsPage() {
  const router = useRouter();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    fetch(`/api/v1/bills?${params}`, { headers: { "x-organization-id": orgId } })
      .then((r) => r.json()).then((data) => { if (data.data) setBills(data.data); }).finally(() => setLoading(false));
  }, [statusFilter]);

  const outstanding = bills.filter((b) => ["received", "partial", "overdue"].includes(b.status)).reduce((s, b) => s + b.amountDue, 0);

  if (!loading && bills.length === 0 && statusFilter === "all") {
    return (
      <div className="space-y-6">
        <PageHeader title="Bills" description="Manage purchase bills." />
        <EmptyState icon={ShoppingCart} title="No bills yet" description="Add your first bill from a supplier.">
          <Button onClick={() => router.push("/bills/new")} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="mr-2 size-4" />New Bill</Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Bills" description="Manage purchase bills.">
        <Button onClick={() => router.push("/bills/new")} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="mr-2 size-4" />New Bill</Button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard title="Outstanding" value={formatMoney(outstanding)} icon={ShoppingCart} />
        <StatCard title="Total Bills" value={bills.length.toString()} icon={ShoppingCart} />
      </div>
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="received">Received</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
        </TabsList>
      </Tabs>
      <DataTable columns={columns} data={bills} loading={loading} emptyMessage="No bills found." onRowClick={(r) => router.push(`/bills/${r.id}`)} />
    </div>
  );
}

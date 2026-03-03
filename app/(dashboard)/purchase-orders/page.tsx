"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Receipt } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";

interface PO {
  id: string; poNumber: string; issueDate: string; deliveryDate: string | null; status: string;
  total: number; contact: { name: string } | null;
}

const statusColors: Record<string, string> = {
  draft: "", sent: "border-blue-200 bg-blue-50 text-blue-700", partial: "border-amber-200 bg-amber-50 text-amber-700",
  received: "border-emerald-200 bg-emerald-50 text-emerald-700", closed: "border-gray-200 bg-gray-50 text-gray-700", void: "border-red-200 bg-red-50 text-red-700",
};

const columns: Column<PO>[] = [
  { key: "number", header: "Number", className: "w-32", render: (r) => <span className="font-mono text-sm">{r.poNumber}</span> },
  { key: "contact", header: "Supplier", render: (r) => <span className="text-sm font-medium">{r.contact?.name || "-"}</span> },
  { key: "date", header: "Date", className: "w-28", render: (r) => <span className="text-sm">{r.issueDate}</span> },
  { key: "delivery", header: "Delivery", className: "w-28", render: (r) => <span className="text-sm">{r.deliveryDate || "-"}</span> },
  { key: "status", header: "Status", className: "w-24", render: (r) => <Badge variant="outline" className={statusColors[r.status] || ""}>{r.status}</Badge> },
  { key: "total", header: "Total", className: "w-28 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{formatMoney(r.total)}</span> },
];

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const [pos, setPos] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    fetch(`/api/v1/purchase-orders?${params}`, { headers: { "x-organization-id": orgId } })
      .then((r) => r.json()).then((data) => { if (data.data) setPos(data.data); }).finally(() => setLoading(false));
  }, [statusFilter]);

  if (!loading && pos.length === 0 && statusFilter === "all") {
    return (
      <div className="space-y-6">
        <PageHeader title="Purchase Orders" description="Manage purchase orders." />
        <EmptyState icon={Receipt} title="No purchase orders yet" description="Create a PO to order from suppliers.">
          <Button onClick={() => router.push("/purchase-orders/new")} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="mr-2 size-4" />New PO</Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Purchase Orders" description="Manage purchase orders.">
        <Button onClick={() => router.push("/purchase-orders/new")} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="mr-2 size-4" />New PO</Button>
      </PageHeader>
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="draft">Draft</TabsTrigger><TabsTrigger value="sent">Sent</TabsTrigger></TabsList>
      </Tabs>
      <DataTable columns={columns} data={pos} loading={loading} emptyMessage="No purchase orders found." onRowClick={(r) => router.push(`/purchase-orders/${r.id}`)} />
    </div>
  );
}

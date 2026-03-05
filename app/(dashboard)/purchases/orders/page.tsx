"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Receipt } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";
import { BlurReveal } from "@/components/ui/blur-reveal";

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

  const openTotal = pos
    .filter((p) => ["draft", "sent", "partial"].includes(p.status))
    .reduce((s, p) => s + p.total, 0);

  if (!loading && pos.length === 0 && statusFilter === "all") {
    return (
      <BlurReveal className="space-y-10">
        <Section title="Purchase Orders" description="Submit and manage purchase orders to suppliers.">
          <EmptyState
            icon={Receipt}
            title="No purchase orders yet"
            description="Create a PO to order from suppliers."
          >
            <Button
              onClick={() => router.push("/purchases/orders/new")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New PO
            </Button>
          </EmptyState>
        </Section>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal className="space-y-10">
      <Section title="Overview" description="A summary of your purchase orders and outstanding amounts.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              title="Open Orders"
              value={formatMoney(openTotal)}
              icon={Receipt}
            />
            <StatCard
              title="Total Orders"
              value={pos.length.toString()}
              icon={Receipt}
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => router.push("/purchases/orders/new")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New PO
            </Button>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Purchase Orders" description="View and manage all your purchase orders.">
        <div className="space-y-4">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="sent">Sent</TabsTrigger>
            </TabsList>
          </Tabs>

          <DataTable
            columns={columns}
            data={pos}
            loading={loading}
            emptyMessage="No purchase orders found."
            onRowClick={(r) => router.push(`/purchases/orders/${r.id}`)}
          />
        </div>
      </Section>
    </BlurReveal>
  );
}

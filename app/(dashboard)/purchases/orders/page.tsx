"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Receipt } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
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

  if (!loading && pos.length === 0 && statusFilter === "all") {
    return (
      <BlurReveal className="space-y-10">
        <Section title="Purchase Orders" description="Submit and manage purchase orders to suppliers.">
          <div className="min-h-[50vh] flex flex-col items-center justify-center text-center py-12">
            <div className="grid grid-cols-3 gap-3 mb-8 w-full max-w-md opacity-40">
              {[
                { label: "Draft", color: "border-l-gray-400" },
                { label: "Sent", color: "border-l-blue-500" },
                { label: "Received", color: "border-l-emerald-500" },
              ].map(({ label, color }) => (
                <div key={label} className={`rounded-lg border border-dashed border-l-4 ${color} p-3`}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-semibold tabular-nums text-muted-foreground/40 mt-0.5">0</p>
                </div>
              ))}
            </div>
            <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
              <Receipt className="size-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="mt-4 text-sm font-medium">No purchase orders yet</h3>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Create a PO to order from suppliers and track fulfillment.
            </p>
            <div className="mt-4">
              <Button
                onClick={() => router.push("/purchases/orders/new")}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="mr-2 size-4" />
                New PO
              </Button>
            </div>
          </div>
        </Section>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal className="space-y-10">
      <Section title="Overview" description="A summary of your purchase orders and outstanding amounts.">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {([
              { status: "draft", label: "Draft", color: "border-l-gray-400" },
              { status: "sent", label: "Sent", color: "border-l-blue-500" },
              { status: "partial", label: "Partial", color: "border-l-amber-500" },
              { status: "received", label: "Received", color: "border-l-emerald-500" },
            ] as const).map(({ status, label, color }) => {
              const items = pos.filter((p) => p.status === status);
              const total = items.reduce((s, p) => s + p.total, 0);
              return (
                <div key={status} className={`rounded-lg border border-l-4 ${color} bg-card p-4`}>
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold mt-1 tabular-nums">{items.length}</p>
                  {total > 0 && <p className="text-xs font-mono text-muted-foreground tabular-nums mt-0.5">{formatMoney(total)}</p>}
                </div>
              );
            })}
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

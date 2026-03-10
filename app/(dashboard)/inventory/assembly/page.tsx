"use client";

import { useState, useEffect } from "react";
import { Cog, Play, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";

interface AssemblyOrder {
  id: string;
  quantity: number;
  status: string;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  bom: {
    name: string;
    assemblyItem: { name: string; code: string } | null;
  } | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
  in_progress: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

export default function AssemblyOrdersPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [orders, setOrders] = useState<AssemblyOrder[]>([]);
  const [loading, setLoading] = useState(true);

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  function fetchOrders() {
    fetch("/api/v1/inventory/assembly-orders", { headers: getHeaders() })
      .then((r) => r.json())
      .then((data) => { if (data.data) setOrders(data.data); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchOrders(); }, []);

  async function handleComplete(order: AssemblyOrder) {
    await confirm({
      title: `Complete assembly order?`,
      description: `This will deduct components from inventory and add ${order.quantity} assembled items.`,
      confirmLabel: "Complete",
      onConfirm: async () => {
        const res = await fetch(`/api/v1/inventory/assembly-orders/${order.id}/complete`, {
          method: "POST",
          headers: getHeaders(),
        });
        const data = await res.json();
        if (data.error) {
          toast.error(data.error);
        } else {
          toast.success("Assembly completed");
          fetchOrders();
        }
      },
    });
  }

  async function handleStart(orderId: string) {
    await fetch(`/api/v1/inventory/assembly-orders/${orderId}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ status: "in_progress" }),
    });
    toast.success("Assembly started");
    fetchOrders();
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Assembly Orders</h2>
          <p className="text-sm text-muted-foreground">
            Track assembly work orders and inventory transformations.
          </p>
        </div>

        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <Cog className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-medium">No assembly orders</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Create assembly orders from your bills of materials.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between rounded-lg border bg-card p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">
                      {order.bom?.assemblyItem?.name || "Unknown"} x{order.quantity}
                    </h3>
                    <Badge variant="outline" className={STATUS_BADGE[order.status]}>
                      {order.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    BOM: {order.bom?.name || "Unknown"}
                    {order.completedAt && ` · Completed ${new Date(order.completedAt).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {order.status === "draft" && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleStart(order.id)}>
                      <Play className="size-3" /> Start
                    </Button>
                  )}
                  {(order.status === "draft" || order.status === "in_progress") && (
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={() => handleComplete(order)}>
                      <CheckCircle2 className="size-3" /> Complete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {confirmDialog}
      </div>
    </ContentReveal>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Cog, Play, CheckCircle2, XCircle, ClipboardList, ArrowRightLeft, BarChart3 } from "lucide-react";
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
          <div className="relative flex min-h-[calc(100vh-14rem)] flex-col">
            {/* Ghost order rows */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-2">
              <div className="w-full max-w-2xl space-y-2">
                {["draft", "in_progress", "completed", "draft"].map((status, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-muted/60 bg-card/40 p-4">
                    <div className={`size-5 rounded ${status === "completed" ? "bg-emerald-200/30 dark:bg-emerald-800/20" : status === "in_progress" ? "bg-blue-200/30 dark:bg-blue-800/20" : "bg-muted/40"}`} />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 rounded bg-muted" style={{ width: `${(i + 5) * 16}px` }} />
                      <div className="h-2 w-20 rounded bg-muted/30" />
                    </div>
                    <div className="h-5 w-16 rounded-full border border-muted/40" />
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-b from-content-bg/20 via-content-bg/70 to-content-bg" />
            </div>

            {/* Centered content */}
            <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 sm:py-12 text-center">
              <div className="flex size-12 sm:size-14 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-950/50">
                <Cog className="size-6 sm:size-7 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="mt-4 sm:mt-5 text-lg sm:text-xl font-semibold tracking-tight">Assembly Orders</h2>
              <p className="mt-2 max-w-md text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Transform raw materials into finished products. Track work orders from creation through completion with automatic inventory updates.
              </p>
            </div>

            {/* Feature cards */}
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3 px-4 sm:px-0 pb-6 sm:pb-8">
              {[
                {
                  icon: ClipboardList,
                  title: "Work orders",
                  description: "Create assembly orders from your bills of materials and track progress through each stage.",
                  color: "text-blue-600 dark:text-blue-400",
                  bg: "bg-blue-50 dark:bg-blue-950/40",
                },
                {
                  icon: ArrowRightLeft,
                  title: "Auto inventory",
                  description: "Components are automatically deducted and finished goods added when an order completes.",
                  color: "text-purple-600 dark:text-purple-400",
                  bg: "bg-purple-50 dark:bg-purple-950/40",
                },
                {
                  icon: BarChart3,
                  title: "Status tracking",
                  description: "Monitor orders from draft to in-progress to completed with full audit trail.",
                  color: "text-emerald-600 dark:text-emerald-400",
                  bg: "bg-emerald-50 dark:bg-emerald-950/40",
                },
              ].map(({ icon: Icon, title, description, color, bg }) => (
                <div key={title} className="rounded-xl p-4 sm:p-5">
                  <div className={`flex size-9 items-center justify-center rounded-lg ${bg}`}>
                    <Icon className={`size-4.5 ${color}`} />
                  </div>
                  <h3 className="mt-3 text-[13px] font-semibold">{title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
                </div>
              ))}
            </div>
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

"use client";

import { useState, useEffect } from "react";
import { Cog, Play, CheckCircle2, XCircle, ClipboardList, ArrowRightLeft, BarChart3, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

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
  useDocumentTitle("Inventory · Assembly");

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  async function fetchOrders() {
    try {
      const res = await fetch("/api/v1/inventory/assembly-orders", { headers: getHeaders() });
      const data = await res.json();
      if (data.data) setOrders(data.data);
    } finally {
      setLoading(false);
    }
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
          toast.error(typeof data.error === "string" ? data.error : "Something went wrong");
        } else {
          await fetchOrders();
          toast.success("Assembly completed");
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
    await fetchOrders();
    toast.success("Assembly started");
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
          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start pt-4">
            {/* Left: mock assembly lifecycle */}
            <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
              <div className="bg-muted/30 px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Example assembly workflow
                </p>
              </div>
              <div className="p-5 space-y-3">
                {/* Draft */}
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex size-6 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800">
                        <ClipboardList className="size-3 text-zinc-500" />
                      </div>
                      <p className="text-sm font-medium">Standing Desk x10</p>
                    </div>
                    <Badge variant="outline" className={STATUS_BADGE.draft + " text-[10px]"}>draft</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">BOM: Standing Desk Frame</p>
                </div>
                <div className="flex justify-center"><ArrowRight className="size-3.5 text-muted-foreground/30 rotate-90" /></div>
                {/* In progress */}
                <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex size-6 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                        <Play className="size-3 text-blue-500" />
                      </div>
                      <p className="text-sm font-medium">Assembling...</p>
                    </div>
                    <Badge variant="outline" className={STATUS_BADGE.in_progress + " text-[10px]"}>in progress</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Components reserved from inventory</p>
                </div>
                <div className="flex justify-center"><ArrowRight className="size-3.5 text-muted-foreground/30 rotate-90" /></div>
                {/* Completed */}
                <div className="rounded-lg border border-dashed border-emerald-200 dark:border-emerald-900/40 p-3 opacity-60">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex size-6 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-950/40">
                        <CheckCircle2 className="size-3 text-emerald-500" />
                      </div>
                      <p className="text-sm font-medium">Complete</p>
                    </div>
                    <Badge variant="outline" className={STATUS_BADGE.completed + " text-[10px]"}>completed</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">10 finished items added to stock</p>
                </div>
              </div>
            </div>

            {/* Right: benefits */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                How assembly orders work
              </p>
              {[
                {
                  title: "Create from BOMs",
                  desc: "Select a bill of materials and specify quantity to create an assembly work order.",
                  icon: ClipboardList,
                  color: "border-l-blue-400",
                },
                {
                  title: "Track progress",
                  desc: "Move orders from draft to in-progress to completed as your team works through them.",
                  icon: Play,
                  color: "border-l-amber-400",
                },
                {
                  title: "Auto inventory updates",
                  desc: "Components are deducted and finished goods are added to stock when an order completes.",
                  icon: ArrowRightLeft,
                  color: "border-l-emerald-400",
                },
                {
                  title: "Full audit trail",
                  desc: "Every status change and inventory movement is recorded for complete traceability.",
                  icon: BarChart3,
                  color: "border-l-violet-400",
                },
              ].map(({ title, desc, icon: Icon, color }) => (
                <div key={title} className={`rounded-lg border border-l-[3px] ${color} bg-card px-4 py-3`}>
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium">{title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 ml-[22px]">{desc}</p>
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

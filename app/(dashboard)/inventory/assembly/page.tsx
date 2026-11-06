"use client";

import { useState } from "react";
import { Play, CheckCircle2, XCircle, ClipboardList, ArrowRightLeft, BarChart3, ArrowRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useApi } from "@/lib/query/use-api";
import { AssemblyOrderSheet, sendJson } from "@/components/dashboard/assembly-order-sheet";

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
  completed: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300",
  cancelled: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Planned",
  in_progress: "Building",
  completed: "Built",
  cancelled: "Cancelled",
};

export default function AssemblyOrdersPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { data, loading } = useApi<{ data?: AssemblyOrder[] }>("/api/v1/inventory/assembly-orders");
  const orders = data?.data ?? [];
  const [sheetOpen, setSheetOpen] = useState(false);
  useDocumentTitle("Inventory · Assembly");

  async function handleComplete(order: AssemblyOrder) {
    await confirm({
      title: `Complete assembly order?`,
      description: `The parts are used up at their current cost and ${order.quantity} finished item${order.quantity === 1 ? " is" : "s are"} added to stock. One journal entry is posted. This can't be undone.`,
      confirmLabel: "Complete",
      onConfirm: async () => {
        try {
          await sendJson(`/api/v1/inventory/assembly-orders/${order.id}/complete`, "POST");
          toast.success("Assembly completed");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Something went wrong");
          throw err;
        }
      },
    });
  }

  async function handleStart(orderId: string) {
    try {
      await sendJson(`/api/v1/inventory/assembly-orders/${orderId}/start`, "POST");
      toast.success("Marked as building");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function handleCancel(order: AssemblyOrder) {
    await confirm({
      title: "Cancel assembly order?",
      description: "Nothing has been used up yet, so stock stays as it is.",
      confirmLabel: "Cancel order",
      destructive: true,
      onConfirm: async () => {
        try {
          await sendJson(`/api/v1/inventory/assembly-orders/${order.id}/cancel`, "POST");
          toast.success("Assembly order cancelled");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Something went wrong");
          throw err;
        }
      },
    });
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Assembly orders</h2>
            <p className="text-sm text-muted-foreground">
              Build finished items from their parts, using up the parts&apos; stock.
            </p>
          </div>
          <Button size="sm" onClick={() => setSheetOpen(true)}>
            <Plus className="mr-1.5 size-3.5" />
            New assembly order
          </Button>
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
                    <Badge variant="outline" className={STATUS_BADGE.draft + " text-[10px]"}>{STATUS_LABEL.draft}</Badge>
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
                    <Badge variant="outline" className={STATUS_BADGE.in_progress + " text-[10px]"}>{STATUS_LABEL.in_progress}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Being built. Parts are used up when you complete it</p>
                </div>
                <div className="flex justify-center"><ArrowRight className="size-3.5 text-muted-foreground/30 rotate-90" /></div>
                {/* Completed */}
                <div className="rounded-lg border border-dashed border-brand-200 dark:border-brand-900/40 p-3 opacity-60">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex size-6 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-950/40">
                        <CheckCircle2 className="size-3 text-brand-500" />
                      </div>
                      <p className="text-sm font-medium">Complete</p>
                    </div>
                    <Badge variant="outline" className={STATUS_BADGE.completed + " text-[10px]"}>{STATUS_LABEL.completed}</Badge>
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
                  desc: "Move orders from planned to building to built as your team works through them.",
                  icon: Play,
                  color: "border-l-amber-400",
                },
                {
                  title: "Auto inventory updates",
                  desc: "Components are deducted and finished goods are added to stock when an order completes.",
                  icon: ArrowRightLeft,
                  color: "border-l-brand-400",
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
                      {STATUS_LABEL[order.status] ?? order.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    BOM: {order.bom?.name || "Unknown"}
                    {order.completedAt && ` · Built ${new Date(order.completedAt).toLocaleDateString()}`}
                    {order.notes && ` · ${order.notes}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {order.status === "draft" && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleStart(order.id)}>
                      <Play className="size-3" /> Start
                    </Button>
                  )}
                  {(order.status === "draft" || order.status === "in_progress") && (
                    <>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => handleCancel(order)}>
                        <XCircle className="size-3" /> Cancel
                      </Button>
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={() => handleComplete(order)}>
                        <CheckCircle2 className="size-3" /> Complete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <AssemblyOrderSheet open={sheetOpen} onOpenChange={setSheetOpen} />
        {confirmDialog}
      </div>
    </ContentReveal>
  );
}

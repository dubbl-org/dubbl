"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Package,
  ShoppingCart,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { cn } from "@/lib/utils";

interface ReorderItem {
  id: string;
  code: string;
  name: string;
  sku: string | null;
  quantityOnHand: number;
  reorderPoint: number;
  suggestedReorderQuantity: number;
  preferredSupplier: {
    contactId: string;
    contactName: string;
    purchasePrice: number;
  } | null;
}

export default function AlertsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [loading, setLoading] = useState(true);
  useDocumentTitle("Inventory · Stock Alerts");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    fetch("/api/v1/inventory/reorder-suggestions", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setItems(data.data || []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);

  if (loading) return <BrandLoader />;

  const criticalCount = items.filter((i) => i.quantityOnHand === 0).length;
  const lowCount = items.length;

  if (items.length === 0) {
    return (
      <ContentReveal>
        <EmptyState
          icon={AlertTriangle}
          title="No reorder alerts"
          description="All items are above their reorder point. You're in good shape!"
        />
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="size-3.5 text-amber-500" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Total Alerts</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate text-amber-600 dark:text-amber-400">
            {lowCount}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="size-3.5 text-red-500" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Out of Stock</span>
          </div>
          <p className={cn(
            "mt-2 text-2xl font-bold font-mono tabular-nums truncate",
            criticalCount > 0 ? "text-red-600 dark:text-red-400" : ""
          )}>
            {criticalCount}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Package className="size-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Below Reorder</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
            {lowCount - criticalCount}
          </p>
        </div>
      </div>

      {/* Alert Items */}
      <div className="rounded-xl border bg-card divide-y">
        {items.map((item) => {
          const isCritical = item.quantityOnHand === 0;
          return (
            <div
              key={item.id}
              className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                isCritical
                  ? "bg-red-50 dark:bg-red-950/40"
                  : "bg-amber-50 dark:bg-amber-950/40"
              )}>
                <Package className={cn(
                  "size-4",
                  isCritical
                    ? "text-red-600 dark:text-red-400"
                    : "text-amber-600 dark:text-amber-400"
                )} />
              </div>
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => router.push(`/inventory/${item.id}`)}
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  {isCritical && (
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300 text-[10px] px-1.5 py-0">
                      Out of Stock
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.code}{item.sku ? ` · ${item.sku}` : ""} · Qty: {item.quantityOnHand} / Reorder at {item.reorderPoint}
                </p>
              </div>

              {/* Suggested quantity */}
              <div className="hidden sm:flex flex-col items-end gap-0.5 w-24">
                <span className="text-xs font-mono tabular-nums font-medium">+{item.suggestedReorderQuantity}</span>
                <span className="text-[11px] text-muted-foreground">suggested</span>
              </div>

              {/* Supplier + PO action */}
              <div className="flex items-center gap-2">
                {item.preferredSupplier && (
                  <span className="hidden md:inline text-xs text-muted-foreground truncate max-w-[120px]">
                    {item.preferredSupplier.contactName}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDrawer("purchaseOrder");
                  }}
                >
                  <ShoppingCart className="size-3" />
                  <span className="hidden sm:inline">Create PO</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </ContentReveal>
  );
}

"use client";

import { useParams } from "next/navigation";
import { Clock } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/query/use-api";

const movementTypeColors: Record<string, string> = {
  adjustment: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  stock_take: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  purchase: "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-950 dark:text-brand-300 dark:border-brand-800",
  sale: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  transfer_in: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800",
  transfer_out: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950 dark:text-pink-300 dark:border-pink-800",
  initial: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800",
};

export default function InventoryItemHistoryPage() {
  const { id } = useParams<{ id: string }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, loading } = useApi<{ data?: any[] }>(`/api/v1/inventory/${id}/movements?limit=50`);
  const movements = data?.data ?? [];
  useDocumentTitle("Inventory · Stock History");

  if (loading) return <BrandLoader />;

  if (movements.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No stock movements yet"
        description="Movements will appear here when stock is adjusted, purchased, or sold."
        compact
      />
    );
  }

  return (
    <div className="rounded-xl border bg-card divide-y">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {movements.map((m: any, i: number) => {
        const qty = m.quantity ?? m.quantityChange ?? m.adjustment ?? 0;
        const isPositive = qty > 0;
        const typeKey = (m.type || m.movementType || "adjustment").replace(/-/g, "_");
        return (
          <div key={m.id || i} className="flex items-start gap-4 p-4">
            <div className="flex flex-col items-center gap-1 pt-0.5">
              <Badge variant="outline" className={cn("text-[10px] capitalize", movementTypeColors[typeKey] || movementTypeColors.initial)}>
                {typeKey.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-sm font-mono font-semibold tabular-nums",
                  isPositive ? "text-brand-600 dark:text-brand-400" : "text-red-600 dark:text-red-400"
                )}>
                  {isPositive ? "+" : ""}{qty}
                </span>
                {(m.previousQuantity != null && m.newQuantity != null) && (
                  <span className="text-xs text-muted-foreground font-mono tabular-nums">
                    {m.previousQuantity} &rarr; {m.newQuantity}
                  </span>
                )}
              </div>
              {m.reason && (
                <p className="text-xs text-muted-foreground mt-0.5">{m.reason}</p>
              )}
              {m.createdBy && (
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">by {m.createdBy}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground">
                {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "-"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

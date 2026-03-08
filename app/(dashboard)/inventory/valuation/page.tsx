"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package,
  DollarSign,
  TrendingUp,
  BarChart3,
  Download,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

interface ValuationItem {
  id: string;
  code: string;
  name: string;
  category: string | null;
  quantityOnHand: number;
  purchasePrice: number;
  salePrice: number;
  totalCost: number;
  totalValue: number;
  marginPercent: number;
}

interface ValuationSummary {
  totalItems: number;
  totalCost: number;
  totalRetailValue: number;
  totalMargin: number;
}

type SortKey =
  | "code"
  | "name"
  | "category"
  | "quantityOnHand"
  | "purchasePrice"
  | "totalCost"
  | "salePrice"
  | "totalValue"
  | "marginPercent";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "category", label: "Category" },
  { key: "quantityOnHand", label: "Qty On Hand", align: "right" },
  { key: "purchasePrice", label: "Unit Cost", align: "right" },
  { key: "totalCost", label: "Total Cost", align: "right" },
  { key: "salePrice", label: "Sale Price", align: "right" },
  { key: "totalValue", label: "Total Value", align: "right" },
  { key: "marginPercent", label: "Margin %", align: "right" },
];

export default function InventoryValuationPage() {
  const [items, setItems] = useState<ValuationItem[]>([]);
  const [summary, setSummary] = useState<ValuationSummary>({
    totalItems: 0,
    totalCost: 0,
    totalRetailValue: 0,
    totalMargin: 0,
  });
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    fetch("/api/v1/reports/inventory-valuation", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.items) setItems(data.items);
        if (data.summary) setSummary(data.summary);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortOrder("asc");
      }
    },
    [sortKey]
  );

  const sortedItems = [...items].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    const dir = sortOrder === "asc" ? 1 : -1;

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    if (typeof aVal === "string" && typeof bVal === "string") {
      return aVal.localeCompare(bVal) * dir;
    }
    return ((aVal as number) - (bVal as number)) * dir;
  });

  function exportCsv() {
    const headers = [
      "Code",
      "Name",
      "Category",
      "Qty On Hand",
      "Unit Cost",
      "Total Cost",
      "Sale Price",
      "Total Value",
      "Margin %",
    ];
    const rows = sortedItems.map((i) => [
      i.code,
      i.name,
      i.category || "",
      i.quantityOnHand,
      (i.purchasePrice / 100).toFixed(2),
      (i.totalCost / 100).toFixed(2),
      (i.salePrice / 100).toFixed(2),
      (i.totalValue / 100).toFixed(2),
      i.marginPercent.toFixed(1),
    ]);
    const csv = [headers, ...rows]
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-valuation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Inventory Valuation</h1>
          <p className="text-sm text-muted-foreground">
            Overview of inventory cost and retail value across all items.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={exportCsv}
          disabled={items.length === 0}
        >
          <Download className="size-3" />
          <span className="hidden sm:inline">Export CSV</span>
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Package className="size-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wide">
              Total Items
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums">
            {summary.totalItems}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="size-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wide">
              Total Cost
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums">
            {formatMoney(summary.totalCost)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BarChart3 className="size-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wide">
              Total Retail Value
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums">
            {formatMoney(summary.totalRetailValue)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="size-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wide">
              Total Margin
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums">
            {summary.totalMargin > 0
              ? `${summary.totalMargin.toFixed(1)}%`
              : "-"}
          </p>
        </div>
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No inventory data"
          description="Add inventory items to see valuation data here."
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-4 py-3 text-xs font-medium text-muted-foreground cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors",
                      col.align === "right" ? "text-right" : "text-left"
                    )}
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortKey === col.key ? (
                        sortOrder === "asc" ? (
                          <ChevronUp className="size-3" />
                        ) : (
                          <ChevronDown className="size-3" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-30" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => (
                <tr
                  key={item.id}
                  className="border-b last:border-b-0 hover:bg-muted/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    {item.code}
                  </td>
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.category || "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {item.quantityOnHand}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatMoney(item.purchasePrice)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatMoney(item.totalCost)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatMoney(item.salePrice)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-medium">
                    {formatMoney(item.totalValue)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-mono tabular-nums",
                      item.marginPercent > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : item.marginPercent < 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-muted-foreground"
                    )}
                  >
                    {item.marginPercent.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ContentReveal>
  );
}

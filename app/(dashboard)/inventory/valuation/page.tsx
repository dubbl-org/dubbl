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
  Search,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { motion } from "motion/react";

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
  const { open: openDrawer } = useCreateDrawer();
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
  const [searchQuery, setSearchQuery] = useState("");
  useDocumentTitle("Inventory · Valuation");

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

  const filteredItems = items.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q) ||
      (item.category && item.category.toLowerCase().includes(q))
    );
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
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

  const profitAmount = summary.totalRetailValue - summary.totalCost;

  const stats = [
    { label: "Total Items", value: String(summary.totalItems), icon: Package },
    { label: "Total Cost", value: formatMoney(summary.totalCost), icon: DollarSign },
    { label: "Retail Value", value: formatMoney(summary.totalRetailValue), icon: BarChart3, color: "text-emerald-600 dark:text-emerald-400" },
    {
      label: "Avg Margin",
      value: summary.totalMargin > 0 ? `${summary.totalMargin.toFixed(1)}%` : "-",
      icon: TrendingUp,
      color: summary.totalMargin > 0 ? "text-emerald-600 dark:text-emerald-400" : undefined,
    },
  ];

  return (
    <ContentReveal className="space-y-6">
      <PageHeader
        title="Inventory Valuation"
        description="Analyze the cost, retail value, and margin of every item in your inventory."
      >
        {items.length > 0 && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items..."
              className="pl-9 h-9 text-sm"
            />
          </div>
        )}
      </PageHeader>

      {/* Stats + margin overview */}
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        {/* Left: value summary */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-xl border bg-card p-5 flex flex-col justify-between gap-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <BarChart3 className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Valuation</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1.5"
              onClick={exportCsv}
              disabled={items.length === 0}
            >
              <Download className="size-3" />
              Export CSV
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Total Cost</p>
              <p className="text-2xl font-bold font-mono tabular-nums truncate">{formatMoney(summary.totalCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Retail Value</p>
              <p className="text-2xl font-bold font-mono tabular-nums truncate text-emerald-600 dark:text-emerald-400">{formatMoney(summary.totalRetailValue)}</p>
            </div>
          </div>
          {/* Margin bar */}
          {summary.totalRetailValue > 0 && (
            <div className="space-y-1.5">
              <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                <div
                  className="bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.min((summary.totalCost / summary.totalRetailValue) * 100, 100)}%` }}
                />
                {profitAmount > 0 && (
                  <div
                    className="bg-emerald-300 dark:bg-emerald-700 transition-all duration-500"
                    style={{ width: `${(profitAmount / summary.totalRetailValue) * 100}%` }}
                  />
                )}
              </div>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" />Cost ({formatMoney(summary.totalCost)})</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-300 dark:bg-emerald-700" />Margin ({formatMoney(profitAmount)})</span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Right: key metric cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 + i * 0.04 }}
              className="rounded-xl border bg-card p-4 flex flex-col justify-between"
            >
              <div className={cn(
                "flex size-8 items-center justify-center rounded-lg",
                stat.color ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-muted"
              )}>
                <stat.icon className={cn("size-4", stat.color || "text-muted-foreground")} />
              </div>
              <div className="mt-3">
                <p className={cn("text-2xl font-bold font-mono tabular-nums truncate", stat.color)}>
                  {stat.value}
                </p>
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mt-0.5">
                  {stat.label}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="bg-muted/30 px-5 py-3 border-b flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Valuation Preview</p>
            <Button
              onClick={() => openDrawer("inventory")}
              size="sm"
              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-1.5 size-3" />
              Add Item
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Item</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Cost</th>
                <th className="px-4 py-3 text-right font-medium">Retail</th>
                <th className="px-4 py-3 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground/40">
              {[
                { name: "Widget A", code: "WDG-001", qty: 120, cost: "$4.50", retail: "$9.99", margin: "55%" },
                { name: "Gadget Pro", code: "GDG-042", qty: 45, cost: "$22.00", retail: "$39.99", margin: "45%" },
                { name: "Cable USB-C", code: "CBL-100", qty: 300, cost: "$1.20", retail: "$4.99", margin: "76%" },
              ].map(({ name, code, qty, cost, retail, margin }) => (
                <tr key={code} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <p className="text-sm">{name}</p>
                    <p className="text-[11px] font-mono">{code}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{qty}</td>
                  <td className="px-4 py-3 text-right font-mono">{cost}</td>
                  <td className="px-4 py-3 text-right font-mono">{retail}</td>
                  <td className="px-4 py-3 text-right font-mono">{margin}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t px-5 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              Add inventory items with pricing to see real valuation data here.
            </p>
          </div>
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
            <Package className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            No items match your search
          </p>
        </div>
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

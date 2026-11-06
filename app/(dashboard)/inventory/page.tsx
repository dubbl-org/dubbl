"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Upload, ArrowUpDown, Trash2, Power, PowerOff, Tag, AlertTriangle, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { toast } from "sonner";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useApi } from "@/lib/query/use-api";
import { cn } from "@/lib/utils";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, MoneyCell, MutedCell, NumberCell, StatusPill, formatDay, toDayKey } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerHelpers, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface InventoryItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  /** Cents per unit. */
  purchasePrice: number;
  /** Cents per unit. */
  salePrice: number;
  /** Moving average cost, cents per unit. */
  averageCost: number;
  /** Book value of what's on hand, cents. */
  totalValue: number;
  unitOfMeasure: string | null;
  /** Whole units. */
  quantityOnHand: number;
  reorderPoint: number;
  trackingMethod: string;
  costMethod: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Movement {
  id: string;
  type: string;
  quantity: number;
  newQuantity: number;
  reason: string | null;
  createdAt: string;
}

const STATUSES: ExplorerStatus[] = [
  { value: "in_stock", label: "In stock", color: "#10B981", hint: "More on hand than your reorder level" },
  { value: "low", label: "Running low", color: "#F59E0B", hint: "At or below your reorder level. Time to order more" },
  { value: "out", label: "Out of stock", color: "#EF4444", hint: "None left, so you can't sell it right now" },
  { value: "hidden", label: "Hidden", color: "#D4D4D8", hint: "Hidden from lists and pickers" },
];

const TRACKING: Record<string, string> = { none: "Not tracked", serial: "Serial numbers", lot: "Lots", batch: "Batches" };
const COST_METHODS: Record<string, string> = { average: "Average cost", fifo: "First in, first out", standard: "Standard cost" };
const MOVEMENTS: Record<string, string> = {
  adjustment: "Count changed",
  transfer_in: "Moved in",
  transfer_out: "Moved out",
  stock_take: "Stock take",
  purchase: "Bought",
  sale: "Sold",
  initial: "Opening stock",
};

function stockStatus(i: InventoryItem) {
  if (!i.isActive) return "hidden";
  if (i.quantityOnHand <= 0) return "out";
  if (i.quantityOnHand <= i.reorderPoint) return "low";
  return "in_stock";
}

/** Book value: what the stock on hand cost, after write-downs and landed costs. */
const stockValue = (i: InventoryItem) => i.totalValue;
const salesValue = (i: InventoryItem) => i.quantityOnHand * i.salePrice;
/** Same formula as the old summary: how much more you sell for than you pay. */
const markup = (i: InventoryItem) => (i.purchasePrice > 0 ? ((i.salePrice - i.purchasePrice) / i.purchasePrice) * 100 : null);
const dollars = (cents: number) => (cents / 100).toFixed(2);

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

async function bulkAction(action: string, ids: string[], helpers: ExplorerHelpers, extra?: Record<string, unknown>) {
  if (ids.length === 0) return;
  const data = await postJson<{ affected?: number }>("/api/v1/inventory/bulk", { action, ids, ...extra });
  const n = data.affected ?? ids.length;
  toast.success(`${n} item${n !== 1 ? "s" : ""} updated`);
  helpers.clearSelection();
  helpers.refresh();
}

function StockCell({ item }: { item: InventoryItem }) {
  const s = stockStatus(item);
  const percent = item.reorderPoint > 0 ? Math.min((item.quantityOnHand / (item.reorderPoint * 3)) * 100, 100) : item.quantityOnHand > 0 ? 100 : 0;
  const color = STATUSES.find((o) => o.value === s)?.color ?? "#A1A1AA";
  return (
    <span className="inline-flex items-center justify-end gap-2.5">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-foreground/[0.07]">
        <span className="block h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
      </span>
      <span className={cn("w-12 text-right tabular-nums font-medium", s === "out" && "text-red-600 dark:text-red-400", s === "low" && "text-amber-600 dark:text-amber-400")}>
        {item.quantityOnHand.toLocaleString()}
      </span>
    </span>
  );
}

function RecentMovements({ itemId }: { itemId: string }) {
  const { data, error } = useApi<{ data?: Movement[] }>(`/api/v1/inventory/${itemId}/movements?limit=8`);
  const rows = data ? (data.data ?? []) : error ? [] : null;
  return (
    <div className="mt-6">
      <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Recent stock changes</p>
      {!rows ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">No stock changes yet</p>
      ) : (
        <div className="divide-y divide-border/60 rounded-xl border border-border/80">
          {rows.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
              <span className={cn("flex size-7 items-center justify-center rounded-lg", m.quantity >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600")}>
                {m.quantity >= 0 ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{MOVEMENTS[m.type] ?? m.type}</span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {formatDay(toDayKey(new Date(m.createdAt)))}
                  {m.reason ? ` · ${m.reason}` : ""}
                </span>
              </span>
              <span className="text-right">
                <span className={cn("block font-medium tabular-nums", m.quantity >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                  {m.quantity > 0 ? "+" : ""}
                  {m.quantity.toLocaleString()}
                </span>
                <span className="block text-[11.5px] tabular-nums text-muted-foreground">now {m.newQuantity.toLocaleString()}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const { confirm, dialog: confirmDialog } = useConfirm();
  useDocumentTitle("Inventory · Products");

  // Bulk sheets: the rows they act on and the explorer to refresh afterwards
  const [target, setTarget] = useState<{ mode: "category" | "adjust"; ids: string[]; helpers: ExplorerHelpers } | null>(null);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkAdjustment, setBulkAdjustment] = useState("");
  const [bulkAdjustReason, setBulkAdjustReason] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Import
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: { row: number; message: string }[] } | null>(null);

  // Movement chart
  const [chartPeriod, setChartPeriod] = useState("30d");

  const { data: chartJson } = useApi<{ data?: { date: string; in: number; out: number; net: number }[] }>(`/api/v1/inventory/movements/chart?period=${chartPeriod}`, { keepPrevious: true });
  const chartData = chartJson?.data || [];

  // Category suggestions for the bulk category sheet
  const { data: categoriesJson } = useApi<{ categories?: string[] }>(target?.mode === "category" ? "/api/v1/inventory?limit=1" : null);
  const categories = categoriesJson?.categories || [];

  async function submitSheet(action: "set_category" | "adjust_stock", extra: Record<string, unknown>) {
    if (!target) return;
    setBulkLoading(true);
    try {
      await bulkAction(action, target.ids, target.helpers, extra);
      setTarget(null);
      setBulkCategory("");
      setBulkAdjustment("");
      setBulkAdjustReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk action failed");
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleImport() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !importFile) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await fetch("/api/v1/inventory/import", {
        method: "POST",
        headers: { "x-organization-id": orgId },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setImportResult(data);
      toast.success(`Imported: ${data.created} created, ${data.updated} updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportLoading(false);
    }
  }

  const config = useMemo<ExplorerConfig<InventoryItem>>(
    () => ({
      id: "inventory-items",
      endpoint: "/api/v1/inventory",
      noun: { one: "Item", many: "Items" },
      getId: (i) => i.id,
      href: (i) => `/inventory/${i.id}`,
      status: { get: stockStatus, options: STATUSES },
      amount: stockValue,
      amountLabel: "Stock value",
      search: (i) => [i.name, i.code, i.sku, i.category, i.description],
      defaultSort: { key: "added", dir: "desc" },
      facets: [
        { key: "category", label: "Category", value: (i) => i.category || "No category" },
        { key: "visibility", label: "Visibility", value: (i) => (i.isActive ? "Shown" : "Hidden") },
        { key: "tracking", label: "Tracking", value: (i) => TRACKING[i.trackingMethod] ?? i.trackingMethod },
      ],
      columns: [
        { key: "code", label: "Code", className: "w-28", value: (i) => i.code, render: (i) => <NumberCell value={i.code} /> },
        { key: "name", label: "Item", value: (i) => i.name, render: (i) => <span className="truncate font-medium">{i.name}</span> },
        { key: "category", label: "Category", className: "w-36", value: (i) => i.category, render: (i) => <MutedCell value={i.category} /> },
        { key: "status", label: "Stock", className: "w-36", value: stockStatus, render: (i) => <StatusPill value={stockStatus(i)} options={STATUSES} /> },
        {
          key: "onHand",
          label: "On hand",
          align: "right",
          className: "w-36",
          hint: "Units you have right now. The bar fills up at three times your reorder level",
          value: (i) => i.quantityOnHand,
          render: (i) => <StockCell item={i} />,
        },
        { key: "reorder", label: "Reorder at", align: "right", className: "w-24", hint: "When on-hand drops to this, it counts as running low", value: (i) => i.reorderPoint, render: (i) => <span className="tabular-nums text-foreground/70">{i.reorderPoint.toLocaleString()}</span> },
        { key: "cost", label: "Cost", align: "right", className: "w-28", hint: "What you pay for one", value: (i) => i.purchasePrice, csv: (i) => dollars(i.purchasePrice), render: (i) => <MoneyCell cents={i.purchasePrice} className="text-foreground/80" /> },
        { key: "price", label: "Sells for", align: "right", className: "w-28", hint: "What you charge for one", value: (i) => i.salePrice, csv: (i) => dollars(i.salePrice), render: (i) => <MoneyCell cents={i.salePrice} /> },
        {
          key: "markup",
          label: "Markup",
          align: "right",
          className: "w-24",
          hint: "How much more you sell it for than you pay",
          value: (i) => markup(i),
          csv: (i) => (markup(i) == null ? "" : markup(i)!.toFixed(1)),
          render: (i) => {
            const m = markup(i);
            return m == null ? <span className="text-muted-foreground/50">—</span> : <span className={cn("tabular-nums", m < 0 && "text-red-600 dark:text-red-400")}>{m.toFixed(1)}%</span>;
          },
        },
        { key: "value", label: "Stock value", align: "right", className: "w-32", money: true, hint: "What the stock on hand cost you, in your books", value: stockValue, render: (i) => <MoneyCell cents={stockValue(i)} className="font-medium" /> },
        { key: "salesValue", label: "Could sell for", align: "right", className: "w-32", money: true, hidden: true, hint: "On hand times sale price", value: salesValue },
        { key: "bookValue", label: "Book value", align: "right", className: "w-32", money: true, hidden: true, hint: "What your books say the stock is worth, using its real purchase history", value: (i) => i.totalValue },
        { key: "avgCost", label: "Average cost", align: "right", className: "w-28", hidden: true, value: (i) => i.averageCost, csv: (i) => dollars(i.averageCost), render: (i) => <MoneyCell cents={i.averageCost} /> },
        { key: "sku", label: "SKU", className: "w-32", hidden: true, value: (i) => i.sku, render: (i) => <NumberCell value={i.sku} /> },
        { key: "unit", label: "Unit", className: "w-20", hidden: true, value: (i) => i.unitOfMeasure },
        { key: "tracking", label: "Tracking", className: "w-32", hidden: true, value: (i) => TRACKING[i.trackingMethod] ?? i.trackingMethod },
        { key: "costMethod", label: "Costing", className: "w-36", hidden: true, value: (i) => COST_METHODS[i.costMethod] ?? i.costMethod },
        { key: "added", label: "Added", className: "w-32", hidden: true, value: (i) => i.createdAt, render: (i) => <DateCell value={toDayKey(new Date(i.createdAt))} /> },
        { key: "updated", label: "Last changed", className: "w-32", hidden: true, value: (i) => i.updatedAt, render: (i) => <DateCell value={toDayKey(new Date(i.updatedAt))} /> },
      ],
      metrics: (rows) => {
        const value = rows.reduce((s, i) => s + stockValue(i), 0);
        const retail = rows.reduce((s, i) => s + salesValue(i), 0);
        const units = rows.reduce((s, i) => s + Math.max(0, i.quantityOnHand), 0);
        const low = rows.filter((i) => stockStatus(i) === "low");
        const out = rows.filter((i) => stockStatus(i) === "out");
        const refill = [...low, ...out].reduce((s, i) => s + Math.max(0, i.reorderPoint * 2 - i.quantityOnHand) * i.purchasePrice, 0);
        const priced = rows.map(markup).filter((m): m is number => m != null);
        const avgMarkup = priced.length ? priced.reduce((a, b) => a + b, 0) / priced.length : null;
        const byCategory = new Map<string, number>();
        for (const i of rows) byCategory.set(i.category || "No category", (byCategory.get(i.category || "No category") ?? 0) + stockValue(i));
        const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
        return [
          { key: "value", label: "Stock value", color: "#14B8A6", value: formatMoney(value), note: `${plural(units, "unit")} on hand`, hint: "What everything on your shelves cost you, as your books show it (after write-downs and landed costs)." },
          { key: "retail", label: "Could sell for", color: "#8B5CF6", value: formatMoney(retail), note: retail > value ? `${formatMoney(retail - value)} profit if it all sells` : "At today's prices", hint: "What you'd take in if you sold everything on hand at its sale price." },
          { key: "low", label: "Running low", color: "#F59E0B", status: "low", value: low.length.toString(), note: low.length ? "at or below the reorder level" : "Nothing is running low", hint: "Items at or below their reorder level. Order more before they run out." },
          { key: "out", label: "Out of stock", color: "#EF4444", status: "out", value: out.length.toString(), note: out.length || low.length ? `~${formatMoney(refill)} to restock` : "Everything is available", hint: "Items with none left. The restock figure is roughly what it costs to bring low and empty items back to twice their reorder level." },
          { key: "markup", label: "Average markup", color: "#0EA5E9", value: avgMarkup == null ? "—" : `${avgMarkup.toFixed(1)}%`, note: priced.length ? `across ${plural(priced.length, "priced item")}` : "Add costs to see this", hint: "On average, how much more you sell items for than you pay for them." },
          { key: "top", label: "Biggest category", color: "#EC4899", value: top ? top[0] : "—", note: top && value ? `${formatMoney(top[1])} · ${Math.round((top[1] / value) * 100)}% of stock value` : "No stock yet", hint: "The category with the most money tied up in stock." },
        ];
      },
      bulkActions: (selected, helpers) => {
        const ids = selected.map((i) => i.id);
        const run = (action: string) => async () => {
          try {
            await bulkAction(action, ids, helpers);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Bulk action failed");
          }
        };
        return (
          <>
            <ActionButton icon={<Power className="size-3.5" />} run={run("set_active")}>
              Show
            </ActionButton>
            <ActionButton icon={<PowerOff className="size-3.5" />} run={run("set_inactive")}>
              Hide
            </ActionButton>
            <ActionButton icon={<Tag className="size-3.5" />} run={async () => setTarget({ mode: "category", ids, helpers })}>
              Category
            </ActionButton>
            <ActionButton icon={<ArrowUpDown className="size-3.5" />} run={async () => setTarget({ mode: "adjust", ids, helpers })}>
              Change count
            </ActionButton>
            <ActionButton
              icon={<Trash2 className="size-3.5" />}
              className="text-red-600"
              run={async () => {
                const ok = await confirm({
                  title: `Delete ${ids.length} item${ids.length !== 1 ? "s" : ""}?`,
                  description: "This action cannot be undone.",
                  confirmLabel: "Delete",
                  destructive: true,
                });
                if (ok) await run("delete")();
              }}
            >
              Delete
            </ActionButton>
          </>
        );
      },
      preview: (i, helpers) => {
        const s = stockStatus(i);
        const m = markup(i);
        return (
          <DocumentPreview
            number={i.code}
            status={s}
            statusOptions={STATUSES}
            party={i.name}
            partySub={[i.category, i.sku].filter(Boolean).join(" · ") || null}
            amount={stockValue(i)}
            amountLabel="stock value"
            facts={[
              { label: "On hand", value: `${i.quantityOnHand.toLocaleString()}${i.unitOfMeasure ? ` ${i.unitOfMeasure}` : ""}` },
              { label: "Reorder at", value: i.reorderPoint.toLocaleString() },
              { label: "Cost", value: formatMoney(i.purchasePrice) },
              { label: "Sells for", value: formatMoney(i.salePrice) },
              { label: "Markup", value: m == null ? "—" : `${m.toFixed(1)}%` },
              { label: "Could sell for", value: formatMoney(salesValue(i)) },
              { label: "Book value", value: formatMoney(i.totalValue) },
              { label: "Average cost", value: formatMoney(i.averageCost) },
              { label: "Tracking", value: TRACKING[i.trackingMethod] ?? i.trackingMethod },
              { label: "Costing", value: COST_METHODS[i.costMethod] ?? i.costMethod },
            ]}
            actions={
              <>
                <ActionButton primary icon={<ArrowUpDown className="size-3.5" />} run={async () => setTarget({ mode: "adjust", ids: [i.id], helpers })}>
                  Change count
                </ActionButton>
                {(s === "low" || s === "out") && (
                  <ActionButton icon={<AlertTriangle className="size-3.5" />} run={async () => router.push("/inventory/alerts")}>
                    Reorder suggestions
                  </ActionButton>
                )}
                <ActionButton
                  icon={i.isActive ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
                  run={() => bulkAction(i.isActive ? "set_inactive" : "set_active", [i.id], helpers)}
                >
                  {i.isActive ? "Hide" : "Show"}
                </ActionButton>
              </>
            }
          >
            {i.description && (
              <div className="mt-5">
                <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">Description</p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{i.description}</p>
              </div>
            )}
            <RecentMovements itemId={i.id} />
          </DocumentPreview>
        );
      },
      create: { label: "Import items", onClick: () => setImportOpen(true) },
      empty: <InventoryEmpty onCreate={() => openDrawer("inventory")} onImport={() => setImportOpen(true)} />,
    }),
    [confirm, openDrawer, router]
  );

  return (
    <div className="space-y-6">
      <Explorer config={config} />

      {/* Movement chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl border border-border/80 bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[13.5px] font-medium">Stock movements</p>
              <p className="text-[12px] text-muted-foreground">Units coming in and going out across all items</p>
            </div>
            <select value={chartPeriod} onChange={(e) => setChartPeriod(e.target.value)} className="h-8 rounded-lg border border-border/80 bg-background px-2 text-[12.5px]">
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
              <option value="12m">12 months</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--brand-600)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--brand-600)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="outGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="in" name="In" stroke="var(--brand-600)" fill="url(#inGrad)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="out" name="Out" stroke="#ef4444" fill="url(#outGrad)" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bulk set category sheet */}
      <Sheet open={target?.mode === "category"} onOpenChange={(open) => !open && setTarget(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Set Category</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <p className="text-sm text-muted-foreground">
              Set category for {target?.ids.length ?? 0} selected item{target?.ids.length !== 1 ? "s" : ""}.
            </p>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} placeholder="e.g. Electronics, Office" />
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBulkCategory(c)}
                      className={cn("rounded-md px-2 py-1 text-xs transition-colors", bulkCategory === c ? "bg-foreground/[0.055] font-medium" : "border border-border/80 hover:bg-foreground/[0.03]")}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => submitSheet("set_category", { category: bulkCategory })} disabled={bulkLoading} className="bg-brand-600 hover:bg-brand-700">
              {bulkLoading ? "Saving..." : "Apply"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Bulk adjust stock sheet */}
      <Sheet open={target?.mode === "adjust"} onOpenChange={(open) => !open && setTarget(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Change the count</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <p className="text-sm text-muted-foreground">
              {target?.ids.length === 1
                ? "Add or remove units for this item."
                : `Add or remove the same number of units for ${target?.ids.length ?? 0} selected items.`}
            </p>
            <div className="space-y-2">
              <Label>Add or remove units</Label>
              <Input type="number" value={bulkAdjustment} onChange={(e) => setBulkAdjustment(e.target.value)} placeholder="e.g. 10 to add, -5 to remove" />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input value={bulkAdjustReason} onChange={(e) => setBulkAdjustReason(e.target.value)} placeholder="e.g. Stock count, breakage, found extra" />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const adj = parseInt(bulkAdjustment);
                if (!adj) {
                  toast.error("Enter how many units to add or remove");
                  return;
                }
                submitSheet("adjust_stock", { adjustment: adj, reason: bulkAdjustReason });
              }}
              disabled={bulkLoading}
              className="bg-brand-600 hover:bg-brand-700"
            >
              {bulkLoading ? "Saving..." : "Save new count"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Import CSV sheet */}
      <Sheet open={importOpen} onOpenChange={setImportOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Import Inventory</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV file with columns: code, name, description, category, sku, purchasePrice, salePrice, quantityOnHand, reorderPoint
            </p>
            <div className="space-y-2">
              <Label>CSV File</Label>
              <Input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  setImportFile(e.target.files?.[0] || null);
                  setImportResult(null);
                }}
              />
            </div>
            {importResult && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-sm font-medium">Import Results</p>
                <div className="flex gap-4 text-sm">
                  <span className="text-brand-600">{importResult.created} created</span>
                  <span className="text-blue-600">{importResult.updated} updated</span>
                  {importResult.errors.length > 0 && <span className="text-red-600">{importResult.errors.length} errors</span>}
                </div>
                {importResult.errors.length > 0 && (
                  <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                    {importResult.errors.map((err, i) => (
                      <p key={i} className="text-red-600">
                        Row {err.row}: {err.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!importFile || importLoading} className="bg-brand-600 hover:bg-brand-700">
              {importLoading ? "Importing..." : "Import"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {confirmDialog}
    </div>
  );
}

function InventoryEmpty({ onCreate, onImport }: { onCreate: () => void; onImport: () => void }) {
  return (
    <ContentReveal>
      <EmptyState icon={Package} title="No inventory items yet" description="Add your first product or item to start tracking inventory.">
        <div className="flex items-center gap-2">
          <Button onClick={onCreate} className="bg-brand-600 hover:bg-brand-700">
            New Item
          </Button>
          <Button variant="outline" onClick={onImport}>
            <Upload className="mr-2 size-4" />
            Import from CSV
          </Button>
        </div>
      </EmptyState>
    </ContentReveal>
  );
}

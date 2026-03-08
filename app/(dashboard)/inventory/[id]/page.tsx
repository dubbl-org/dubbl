"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Trash2, Package, ArrowUpDown, Save, Loader2, ArrowLeft, Power, PowerOff } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { formatMoney, centsToDecimal } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { setEntityTitle } from "@/lib/hooks/use-entity-title";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { cn } from "@/lib/utils";

interface InventoryItemDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  purchasePrice: number;
  salePrice: number;
  quantityOnHand: number;
  reorderPoint: number;
  isActive: boolean;
}

export default function InventoryItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<InventoryItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustment, setAdjustment] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/inventory/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.inventoryItem) {
          setItem(data.inventoryItem);
          setEntityTitle(data.inventoryItem.name);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch(`/api/v1/inventory/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          code: form.get("code"),
          name: form.get("name"),
          description: form.get("description") || null,
          category: form.get("category") || null,
          sku: form.get("sku") || null,
          purchasePrice: Math.round(parseFloat(form.get("purchasePrice") as string || "0") * 100),
          salePrice: Math.round(parseFloat(form.get("salePrice") as string || "0") * 100),
          reorderPoint: parseInt(form.get("reorderPoint") as string) || 0,
        }),
      });

      if (!res.ok) throw new Error("Failed to update");
      const data = await res.json();
      setItem(data.inventoryItem);
      setEntityTitle(data.inventoryItem.name);
      toast.success("Item updated");
    } catch {
      toast.error("Failed to update item");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjust() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const adj = parseInt(adjustment);
    if (!adj || !adjustReason.trim()) {
      toast.error("Enter a valid adjustment and reason");
      return;
    }

    try {
      const res = await fetch(`/api/v1/inventory/${id}/adjust`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ adjustment: adj, reason: adjustReason }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to adjust");
      }

      const data = await res.json();
      setItem(data.inventoryItem);
      setAdjustOpen(false);
      setAdjustment("");
      setAdjustReason("");
      toast.success(`Quantity adjusted by ${adj > 0 ? "+" : ""}${adj}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to adjust quantity");
    }
  }

  async function handleDelete() {
    const confirmed = await confirm({
      title: "Delete this inventory item?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    await fetch(`/api/v1/inventory/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    toast.success("Item deleted");
    router.push("/inventory");
  }

  if (loading) return <BrandLoader />;

  if (!item) {
    return (
      <div className="space-y-4 pt-12 text-center">
        <p className="text-sm text-muted-foreground">Item not found</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/inventory")}>
          Back to Inventory
        </Button>
      </div>
    );
  }

  const isLowStock = item.quantityOnHand <= item.reorderPoint && item.isActive;
  const stockValue = item.quantityOnHand * item.purchasePrice;
  const margin = item.purchasePrice > 0
    ? ((item.salePrice - item.purchasePrice) / item.purchasePrice * 100)
    : 0;
  const stockPercent = item.reorderPoint > 0
    ? Math.min((item.quantityOnHand / (item.reorderPoint * 3)) * 100, 100)
    : 100;

  return (
    <div>
      {/* Back link */}
      <button
        onClick={() => router.push("/inventory")}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="size-3.5" />
        Back to inventory
      </button>

      <ContentReveal className="space-y-10">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex size-10 items-center justify-center rounded-xl",
              isLowStock
                ? "bg-amber-50 dark:bg-amber-950/40"
                : "bg-emerald-50 dark:bg-emerald-950/40"
            )}>
              <Package className={cn(
                "size-5",
                isLowStock
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              )} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{item.name}</h1>
                {isLowStock && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    Low Stock
                  </Badge>
                )}
                <Badge variant="outline" className={
                  item.isActive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : ""
                }>
                  {item.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {item.code}{item.sku ? ` · ${item.sku}` : ""}{item.category ? ` · ${item.category}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const orgId = localStorage.getItem("activeOrgId");
                if (!orgId) return;
                try {
                  const res = await fetch(`/api/v1/inventory/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", "x-organization-id": orgId },
                    body: JSON.stringify({ isActive: !item.isActive }),
                  });
                  if (!res.ok) throw new Error();
                  const data = await res.json();
                  setItem(data.inventoryItem);
                  toast.success(data.inventoryItem.isActive ? "Item activated" : "Item deactivated");
                } catch {
                  toast.error("Failed to update status");
                }
              }}
            >
              {item.isActive ? (
                <><PowerOff className="mr-1.5 size-3.5" />Deactivate</>
              ) : (
                <><Power className="mr-1.5 size-3.5" />Activate</>
              )}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
              <ArrowUpDown className="mr-1.5 size-3.5" />
              Adjust Stock
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <motion.div
            className="rounded-xl border bg-card p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">On Hand</p>
            <p className={cn(
              "mt-1.5 text-2xl font-bold font-mono tabular-nums",
              isLowStock && "text-amber-600 dark:text-amber-400"
            )}>
              {item.quantityOnHand}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    isLowStock ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${stockPercent}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                Reorder at {item.reorderPoint}
              </span>
            </div>
          </motion.div>
          <motion.div
            className="rounded-xl border bg-card p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Stock Value</p>
            <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums">
              {formatMoney(stockValue)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {item.quantityOnHand} x {formatMoney(item.purchasePrice)}
            </p>
          </motion.div>
          <motion.div
            className="rounded-xl border bg-card p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sale Price</p>
            <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatMoney(item.salePrice)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Cost {formatMoney(item.purchasePrice)}
            </p>
          </motion.div>
          <motion.div
            className="rounded-xl border bg-card p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Margin</p>
            <p className={cn(
              "mt-1.5 text-2xl font-bold font-mono tabular-nums",
              margin > 0 ? "text-emerald-600 dark:text-emerald-400" : margin < 0 ? "text-red-600" : ""
            )}>
              {item.purchasePrice > 0 ? `${margin.toFixed(1)}%` : "-"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {item.purchasePrice > 0 ? `${formatMoney(item.salePrice - item.purchasePrice)} per unit` : "No cost set"}
            </p>
          </motion.div>
        </div>

        {/* Edit form - Section-based layout like contacts */}
        <form onSubmit={handleSubmit} className="space-y-10">
          <Section title="General" description="Item code, name, and identifiers.">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="code">Code</Label>
                  <Input id="code" name="code" required defaultValue={item.code} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="name">Name</Label>
                  <Input id="name" name="name" required defaultValue={item.name} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="category">Category</Label>
                  <Input id="category" name="category" defaultValue={item.category || ""} placeholder="e.g. Electronics" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="sku">SKU</Label>
                  <Input id="sku" name="sku" defaultValue={item.sku || ""} placeholder="Optional" />
                </div>
              </div>
            </div>
          </Section>

          <div className="h-px bg-border" />

          <Section title="Pricing" description="Purchase cost and sale price for this item.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="purchasePrice">Purchase Price</Label>
                <Input
                  id="purchasePrice"
                  name="purchasePrice"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={centsToDecimal(item.purchasePrice)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="salePrice">Sale Price</Label>
                <Input
                  id="salePrice"
                  name="salePrice"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={centsToDecimal(item.salePrice)}
                />
              </div>
            </div>
          </Section>

          <div className="h-px bg-border" />

          <Section title="Stock" description="Reorder point for low stock alerts.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="reorderPoint">Reorder Point</Label>
                <Input
                  id="reorderPoint"
                  name="reorderPoint"
                  type="number"
                  min={0}
                  defaultValue={item.reorderPoint}
                />
              </div>
            </div>
          </Section>

          <div className="h-px bg-border" />

          <Section title="Description" description="Optional notes about this item.">
            <Textarea
              id="description"
              name="description"
              defaultValue={item.description || ""}
              rows={3}
              placeholder="Item description..."
            />
          </Section>

          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-1.5 size-3.5" />
                  Save Changes
                </>
              )}
            </Button>
          </div>

          <div className="h-px bg-border" />

          {/* Danger zone */}
          <Section title="Danger zone" description="Irreversible actions for this item.">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20">
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">Delete this item</p>
                <p className="text-xs text-red-600/70 dark:text-red-400/70">Once deleted, this cannot be undone.</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleDelete}
                className="border-red-300 text-red-600 hover:bg-red-100 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Delete Item
              </Button>
            </div>
          </Section>
        </form>

        {/* Adjust stock sheet */}
        <Sheet open={adjustOpen} onOpenChange={setAdjustOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Adjust Stock</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 px-4">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">Current Quantity</p>
                <p className="text-xl font-bold font-mono tabular-nums">{item.quantityOnHand}</p>
              </div>
              <div className="space-y-2">
                <Label>Adjustment (positive or negative)</Label>
                <Input
                  type="number"
                  value={adjustment}
                  onChange={(e) => setAdjustment(e.target.value)}
                  placeholder="e.g. 10 or -5"
                />
                {adjustment && parseInt(adjustment) !== 0 && (
                  <p className="text-xs text-muted-foreground">
                    New quantity: <span className="font-mono font-medium">{item.quantityOnHand + parseInt(adjustment)}</span>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Reason *</Label>
                <Input
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Reason for adjustment"
                />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
              <Button onClick={handleAdjust} className="bg-emerald-600 hover:bg-emerald-700">
                Apply Adjustment
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {confirmDialog}
      </ContentReveal>
    </div>
  );
}

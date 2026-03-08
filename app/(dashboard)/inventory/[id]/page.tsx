"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Package, ArrowUpDown, Save, Loader2 } from "lucide-react";
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
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Package className="mb-3 size-10 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">Item not found</p>
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
    <ContentReveal className="space-y-6">
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
          <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
            <ArrowUpDown className="mr-1.5 size-3.5" />
            Adjust Stock
          </Button>
          <Button size="sm" variant="outline" onClick={handleDelete} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30">
            <Trash2 className="mr-1.5 size-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">On Hand</p>
          <p className={cn(
            "mt-1.5 text-2xl font-bold font-mono tabular-nums",
            isLowStock && "text-amber-600 dark:text-amber-400"
          )}>
            {item.quantityOnHand}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  isLowStock ? "bg-amber-500" : "bg-emerald-500"
                )}
                style={{ width: `${stockPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              Reorder at {item.reorderPoint}
            </span>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Stock Value</p>
          <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums">
            {formatMoney(stockValue)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {item.quantityOnHand} x {formatMoney(item.purchasePrice)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Sale Price</p>
          <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatMoney(item.salePrice)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Cost {formatMoney(item.purchasePrice)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
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
        </div>
      </div>

      {/* Edit form */}
      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Item Details</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input id="code" name="code" required defaultValue={item.code} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required defaultValue={item.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input id="category" name="category" defaultValue={item.category || ""} placeholder="e.g. Electronics" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" name="sku" defaultValue={item.sku || ""} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reorderPoint">Reorder Point</Label>
              <Input
                id="reorderPoint"
                name="reorderPoint"
                type="number"
                min={0}
                defaultValue={item.reorderPoint}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchasePrice">Purchase Price</Label>
              <Input
                id="purchasePrice"
                name="purchasePrice"
                type="number"
                step="0.01"
                min={0}
                defaultValue={centsToDecimal(item.purchasePrice)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salePrice">Sale Price</Label>
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
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" defaultValue={item.description || ""} rows={3} placeholder="Optional description" />
          </div>
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
        </form>
      </div>

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
  );
}

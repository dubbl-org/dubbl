"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Save, Loader2, Warehouse, Printer, Scale } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { centsToDecimal, formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { setEntityTitle } from "@/lib/hooks/use-entity-title";
import { CategoryPicker } from "@/components/dashboard/category-picker";
import { useInventoryItem } from "./layout";
import JsBarcode from "jsbarcode";

interface WarehouseStockEntry {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  quantity: number;
  updatedAt: string;
}

export default function InventoryItemDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { item, setItem } = useInventoryItem();
  const [saving, setSaving] = useState(false);
  const [categoryId, setCategoryId] = useState(item.categoryId || "");
  const [invPurchasePrice, setInvPurchasePrice] = useState(centsToDecimal(item.purchasePrice));
  const [invSalePrice, setInvSalePrice] = useState(centsToDecimal(item.salePrice));
  const [warehouseStocks, setWarehouseStocks] = useState<WarehouseStockEntry[]>([]);
  // "Revalue stock" sheet: set the book value directly (mark-to-market) without
  // changing the count.
  const [revalueOpen, setRevalueOpen] = useState(false);
  const [revalueValue, setRevalueValue] = useState("");
  const [revalueReason, setRevalueReason] = useState("");
  const [revalueBusy, setRevalueBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  useDocumentTitle("Inventory · Product Details");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  // Fetch per-warehouse stock
  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/inventory/${id}/warehouse-stock`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => setWarehouseStocks(data.data || []));
  }, [id, orgId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
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
          categoryId: categoryId || null,
          sku: form.get("sku") || null,
          purchasePrice: Math.round(parseFloat(invPurchasePrice || "0") * 100),
          salePrice: Math.round(parseFloat(invSalePrice || "0") * 100),
          reorderPoint: parseInt(form.get("reorderPoint") as string) || 0,
        }),
      });

      if (!res.ok) throw new Error("Failed to update");
      const data = await res.json();
      setItem(() => data.inventoryItem);
      setEntityTitle(data.inventoryItem.name);
      toast.success("Item updated");
    } catch {
      toast.error("Failed to update item");
    } finally {
      setSaving(false);
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
    if (!orgId) return;

    await fetch(`/api/v1/inventory/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    toast.success("Item deleted");
    router.push("/inventory");
  }

  const currentBookValue = item.totalValue ?? item.quantityOnHand * item.purchasePrice;

  function openRevalue() {
    // Pre-fill with the current value so the user adjusts from a known starting point.
    setRevalueValue(centsToDecimal(currentBookValue));
    setRevalueReason("");
    setRevalueOpen(true);
  }

  async function handleRevalue() {
    if (!orgId) return;
    const newTotalValue = Math.round(parseFloat(revalueValue || "0") * 100);
    if (Number.isNaN(newTotalValue) || newTotalValue < 0 || !revalueReason.trim()) {
      toast.error("Enter the new value and a reason");
      return;
    }
    if (newTotalValue === currentBookValue) {
      toast.error("That's the same as the current value");
      return;
    }

    const confirmed = await confirm({
      title: "Revalue this stock?",
      description: `Its book value will change from ${formatMoney(currentBookValue)} to ${formatMoney(newTotalValue)}. The count stays the same.`,
      confirmLabel: "Revalue",
    });
    if (!confirmed) return;

    setRevalueBusy(true);
    try {
      const res = await fetch(`/api/v1/inventory/${id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          adjustmentType: "revaluation",
          newTotalValue,
          reason: revalueReason,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't revalue the stock");
      }
      const data = await res.json();
      setItem(() => data.inventoryItem);
      setRevalueOpen(false);
      setRevalueValue("");
      setRevalueReason("");
      toast.success("Stock revalued");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't revalue the stock");
    } finally {
      setRevalueBusy(false);
    }
  }

  function printBarcode() {
    const barcodeValue = item.sku || item.code;
    const canvas = document.createElement("canvas");
    try {
      JsBarcode(canvas, barcodeValue, {
        format: "CODE128",
        width: 2,
        height: 80,
        displayValue: true,
        fontSize: 14,
        margin: 10,
      });
    } catch {
      toast.error("Could not generate barcode for this value");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head><title>${item.name} - Barcode</title></head>
        <body style="display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;flex-direction:column;gap:8px">
          <h3 style="margin:0;font-family:sans-serif">${item.name}</h3>
          <img src="${canvas.toDataURL()}" />
          <script>window.print();window.close();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  // Generate barcode preview
  const barcodeValue = item.sku || item.code;
  const barcodeRef = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    try {
      JsBarcode(canvas, barcodeValue, {
        format: "CODE128",
        width: 1.5,
        height: 50,
        displayValue: true,
        fontSize: 11,
        margin: 5,
      });
    } catch {
      // Invalid barcode value
    }
  };

  return (
    <>
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
                <Label className="text-xs">Category</Label>
                <CategoryPicker value={categoryId} onChange={setCategoryId} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="sku">SKU</Label>
                <Input id="sku" name="sku" defaultValue={item.sku || ""} placeholder="Optional" />
              </div>
            </div>
          </div>
        </Section>

        <div className="h-px bg-border" />

        <Section title="Pricing" description="What this item costs you and what you sell it for.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="purchasePrice">What it costs you</Label>
              <CurrencyInput
                id="purchasePrice"
                prefix="$"
                value={invPurchasePrice}
                onChange={setInvPurchasePrice}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="salePrice">What you sell it for</Label>
              <CurrencyInput
                id="salePrice"
                prefix="$"
                value={invSalePrice}
                onChange={setInvSalePrice}
              />
            </div>
          </div>
        </Section>

        <div className="h-px bg-border" />

        <Section title="Stock" description="Get an alert when you're running low.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="reorderPoint">Alert me when stock drops to</Label>
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
      </form>

      {/* Per-warehouse stock */}
      {warehouseStocks.length > 0 && (
        <>
          <div className="h-px bg-border mt-10" />
          <div className="mt-10">
          <Section title="Stock by location" description="How many units you have at each location.">
            <div className="rounded-lg border divide-y">
              {warehouseStocks.map((ws) => (
                <div key={ws.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Warehouse className="size-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{ws.warehouseName}</p>
                      <p className="text-xs text-muted-foreground">{ws.warehouseCode}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono tabular-nums font-medium">{ws.quantity}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(ws.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
          </div>
        </>
      )}

      {/* Barcode */}
      <div className="h-px bg-border mt-10" />
      <div className="mt-10">
        <Section title="Barcode" description="Generated from SKU or item code.">
          <div className="flex flex-col items-start gap-3">
            <div className="rounded-lg border bg-white p-3">
              <canvas ref={barcodeRef} />
            </div>
            <Button type="button" size="sm" variant="outline" onClick={printBarcode}>
              <Printer className="mr-1.5 size-3.5" />
              Print Barcode
            </Button>
          </div>
        </Section>
      </div>

      {/* Revalue stock */}
      <div className="h-px bg-border mt-10" />
      <div className="mt-10">
        <Section
          title="Revalue stock"
          description="Set what this stock is worth in your books (e.g. mark to market). The count stays the same — only its value changes."
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">Current value in your books</p>
              <p className="text-lg font-bold font-mono tabular-nums truncate">
                {formatMoney(currentBookValue)}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={openRevalue}>
              <Scale className="mr-1.5 size-3.5" />
              Revalue stock
            </Button>
          </div>
        </Section>
      </div>

      <div className="h-px bg-border mt-10" />
      <div className="mt-10">
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
      </div>

      {/* Revalue stock sheet */}
      <Sheet open={revalueOpen} onOpenChange={setRevalueOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Revalue stock</SheetTitle>
            <SheetDescription>
              Set what this stock is worth in your books. Use this when its value
              has changed (for example, market price moved). The count stays the
              same — only its value changes.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs text-muted-foreground">Current value in your books</p>
              <p className="text-xl font-bold font-mono tabular-nums truncate">
                {formatMoney(currentBookValue)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>New value</Label>
              <CurrencyInput
                prefix="$"
                value={revalueValue}
                onChange={setRevalueValue}
              />
            </div>
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Input
                value={revalueReason}
                onChange={(e) => setRevalueReason(e.target.value)}
                placeholder="e.g. Market price changed, revaluation"
              />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setRevalueOpen(false)}>Cancel</Button>
            <Button onClick={handleRevalue} disabled={revalueBusy} className="bg-emerald-600 hover:bg-emerald-700">
              Revalue stock
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {confirmDialog}
    </>
  );
}

"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/query/use-api";

interface Variant {
  id: string;
  name: string;
  sku: string | null;
  /** Cents. */
  purchasePrice: number | null;
  /** Cents. */
  salePrice: number | null;
  quantityOnHand: number | null;
  options: Record<string, string> | null;
  isActive: boolean | null;
}

/** "Color: Red, Size: Large" <-> { Color: "Red", Size: "Large" } */
function parseOptions(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(",")) {
    const [key, ...rest] = part.split(":");
    const value = rest.join(":").trim();
    if (key?.trim() && value) out[key.trim()] = value;
  }
  return out;
}

function formatOptions(options: Record<string, string> | null) {
  return Object.entries(options ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

async function send(url: string, method: string, body?: unknown) {
  const orgId = localStorage.getItem("activeOrgId");
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...(orgId ? { "x-organization-id": orgId } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong");
  return data;
}

export default function InventoryItemVariantsPage() {
  const { id } = useParams<{ id: string }>();
  const url = `/api/v1/inventory/${id}/variants`;
  const { data, loading } = useApi<{ data?: Variant[] }>(url);
  const variants = data?.data ?? [];
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Variant | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [options, setOptions] = useState("");
  const [isActive, setIsActive] = useState(true);
  useDocumentTitle("Inventory · Variants");

  function openSheet(variant: Variant | null) {
    setEditing(variant);
    setName(variant?.name ?? "");
    setSku(variant?.sku ?? "");
    setPurchasePrice(variant?.purchasePrice ? centsToDecimal(variant.purchasePrice) : "");
    setSalePrice(variant?.salePrice ? centsToDecimal(variant.salePrice) : "");
    setQuantity(variant?.quantityOnHand != null ? String(variant.quantityOnHand) : "");
    setOptions(formatOptions(variant?.options ?? null));
    setIsActive(variant?.isActive !== false);
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Variant name is required");
      return;
    }
    setSaving(true);
    const body = {
      name: name.trim(),
      sku: sku.trim() || null,
      purchasePrice: purchasePrice ? Math.round(parseFloat(purchasePrice) * 100) : 0,
      salePrice: salePrice ? Math.round(parseFloat(salePrice) * 100) : 0,
      quantityOnHand: quantity ? Math.max(0, parseInt(quantity) || 0) : 0,
      options: parseOptions(options),
      ...(editing ? { isActive } : {}),
    };
    try {
      if (editing) {
        await send(`${url}/${editing.id}`, "PATCH", body);
        toast.success("Variant updated");
      } else {
        await send(url, "POST", body);
        toast.success("Variant added");
      }
      setSheetOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the variant");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(variant: Variant) {
    const ok = await confirm({
      title: `Delete "${variant.name}"?`,
      description: "The variant is removed from this item.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await send(`${url}/${variant.id}`, "DELETE");
      toast.success("Variant deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the variant");
    }
  }

  if (loading) return <BrandLoader />;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">Variants</h3>
          <p className="text-xs text-muted-foreground">
            Sizes, colors or other versions of this item. Variant counts are for reference and don&apos;t change the item&apos;s stock or your books.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => openSheet(null)}>
          <Plus className="mr-1.5 size-3.5" />
          Add Variant
        </Button>
      </div>

      {variants.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No variants"
          description="Add variants for different sizes, colors, or configurations."
          compact
        >
          <Button size="sm" onClick={() => openSheet(null)} className="bg-brand-600 hover:bg-brand-700">
            <Plus className="mr-1.5 size-3.5" />
            Add Variant
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-xl border bg-card divide-y">
          {variants.map((v) => (
            <div key={v.id} className="flex items-center gap-4 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{v.name}</p>
                  <Badge variant="outline" className={cn(
                    "text-[10px]",
                    v.isActive !== false
                      ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300"
                      : ""
                  )}>
                    {v.isActive !== false ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {v.sku && (
                    <span className="text-xs text-muted-foreground">SKU: {v.sku}</span>
                  )}
                  {v.purchasePrice != null && (
                    <span className="text-xs text-muted-foreground">Cost: {formatMoney(v.purchasePrice)}</span>
                  )}
                  {v.salePrice != null && (
                    <span className="text-xs text-muted-foreground">Sale: {formatMoney(v.salePrice)}</span>
                  )}
                  {v.quantityOnHand != null && (
                    <span className="text-xs text-muted-foreground">Qty: {v.quantityOnHand}</span>
                  )}
                  {Object.entries(v.options ?? {}).map(([key, val]) => (
                    <Badge key={key} variant="secondary" className="text-[10px]">
                      {key}: {String(val)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => openSheet(v)} aria-label="Edit variant">
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="size-7 p-0 text-destructive" onClick={() => handleDelete(v)} aria-label="Delete variant">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Variant" : "Add Variant"}</SheetTitle>
            <SheetDescription>A version of this item, such as a size or color.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Large / Red"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">SKU</Label>
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Optional variant SKU"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Options</Label>
              <Input
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="e.g. Color: Red, Size: Large"
              />
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Purchase Price</Label>
                <CurrencyInput
                  prefix="$"
                  value={purchasePrice}
                  onChange={setPurchasePrice}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sale Price</Label>
                <CurrencyInput
                  prefix="$"
                  value={salePrice}
                  onChange={setSalePrice}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quantity on Hand</Label>
              <Input
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
              />
            </div>
            {editing && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label className="text-xs" htmlFor="variant-active">Active</Label>
                <Switch id="variant-active" checked={isActive} onCheckedChange={setIsActive} />
              </div>
            )}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-brand-600 hover:bg-brand-700">
              {editing ? "Save Changes" : "Add Variant"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {confirmDialog}
    </>
  );
}

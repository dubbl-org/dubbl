"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Layers, Plus } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export default function InventoryItemVariantsPage() {
  const { id } = useParams<{ id: string }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [variants, setVariants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [quantity, setQuantity] = useState("");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/inventory/${id}/variants`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => { if (data.variants) setVariants(data.variants); })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleAdd() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !name.trim()) {
      toast.error("Variant name is required");
      return;
    }

    try {
      const res = await fetch(`/api/v1/inventory/${id}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: name.trim(),
          sku: sku || undefined,
          purchasePrice: purchasePrice ? Math.round(parseFloat(purchasePrice) * 100) : undefined,
          salePrice: salePrice ? Math.round(parseFloat(salePrice) * 100) : undefined,
          quantityOnHand: quantity ? parseInt(quantity) : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add variant");
      }

      const data = await res.json();
      setVariants((prev) => [...prev, data.variant]);
      setAddOpen(false);
      setName("");
      setSku("");
      setPurchasePrice("");
      setSalePrice("");
      setQuantity("");
      toast.success("Variant added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add variant");
    }
  }

  if (loading) return <BrandLoader />;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Variants</h3>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
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
          <Button size="sm" onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="mr-1.5 size-3.5" />
            Add Variant
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-xl border bg-card divide-y">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {variants.map((v: any) => (
            <div key={v.id} className="flex items-center gap-4 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{v.name}</p>
                  <Badge variant="outline" className={cn(
                    "text-[10px]",
                    v.isActive !== false
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
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
                  {v.options && Object.entries(v.options).map(([key, val]) => (
                    <Badge key={key} variant="secondary" className="text-[10px]">
                      {key}: {String(val)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add Variant</SheetTitle>
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
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-700">
              Add Variant
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

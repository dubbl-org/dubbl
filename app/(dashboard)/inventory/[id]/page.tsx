"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Trash2, Package, ArrowUpDown, Save, Loader2, ArrowLeft, Power, PowerOff, Clock, Truck, Layers, Plus, Link2, Unlink } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
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
  imageUrl: string | null;
  purchasePrice: number;
  salePrice: number;
  quantityOnHand: number;
  reorderPoint: number;
  isActive: boolean;
}

const movementTypeColors: Record<string, string> = {
  adjustment: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  stock_take: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  purchase: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  sale: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  initial: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800",
};

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

  const [activeTab, setActiveTab] = useState("details");
  const [movements, setMovements] = useState<any[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [variants, setVariants] = useState<any[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);

  // Supplier link sheet
  const [linkSupplierOpen, setLinkSupplierOpen] = useState(false);
  const [supplierContactId, setSupplierContactId] = useState("");
  const [supplierCode, setSupplierCode] = useState("");
  const [supplierLeadDays, setSupplierLeadDays] = useState("");
  const [supplierPrice, setSupplierPrice] = useState("");
  const [supplierPreferred, setSupplierPreferred] = useState(false);

  // Variant sheet
  const [addVariantOpen, setAddVariantOpen] = useState(false);
  const [variantName, setVariantName] = useState("");
  const [variantSku, setVariantSku] = useState("");
  const [variantPurchasePrice, setVariantPurchasePrice] = useState("");
  const [variantSalePrice, setVariantSalePrice] = useState("");
  const [variantQuantity, setVariantQuantity] = useState("");

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

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !item) return;

    if (activeTab === "movements" && movements.length === 0) {
      setMovementsLoading(true);
      fetch(`/api/v1/inventory/${id}/movements?limit=50`, { headers: { "x-organization-id": orgId } })
        .then(r => r.json())
        .then(data => { if (data.data) setMovements(data.data); })
        .finally(() => setMovementsLoading(false));
    }
    if (activeTab === "suppliers" && suppliers.length === 0) {
      setSuppliersLoading(true);
      fetch(`/api/v1/inventory/${id}/suppliers`, { headers: { "x-organization-id": orgId } })
        .then(r => r.json())
        .then(data => { if (data.suppliers) setSuppliers(data.suppliers); })
        .finally(() => setSuppliersLoading(false));
    }
    if (activeTab === "variants" && variants.length === 0) {
      setVariantsLoading(true);
      fetch(`/api/v1/inventory/${id}/variants`, { headers: { "x-organization-id": orgId } })
        .then(r => r.json())
        .then(data => { if (data.variants) setVariants(data.variants); })
        .finally(() => setVariantsLoading(false));
    }
  }, [activeTab, item, id]);

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

  async function handleLinkSupplier() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !supplierContactId.trim()) {
      toast.error("Contact ID is required");
      return;
    }

    try {
      const res = await fetch(`/api/v1/inventory/${id}/suppliers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          contactId: supplierContactId.trim(),
          supplierCode: supplierCode || undefined,
          leadTimeDays: supplierLeadDays ? parseInt(supplierLeadDays) : undefined,
          purchasePrice: supplierPrice ? Math.round(parseFloat(supplierPrice) * 100) : undefined,
          isPreferred: supplierPreferred,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to link supplier");
      }

      const data = await res.json();
      setSuppliers(prev => [...prev, data.supplier]);
      setLinkSupplierOpen(false);
      setSupplierContactId("");
      setSupplierCode("");
      setSupplierLeadDays("");
      setSupplierPrice("");
      setSupplierPreferred(false);
      toast.success("Supplier linked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link supplier");
    }
  }

  async function handleUnlinkSupplier(supplierId: string) {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch(`/api/v1/inventory/${id}/suppliers/${supplierId}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });

      if (!res.ok) throw new Error("Failed to unlink");
      setSuppliers(prev => prev.filter(s => s.id !== supplierId));
      toast.success("Supplier unlinked");
    } catch {
      toast.error("Failed to unlink supplier");
    }
  }

  async function handleAddVariant() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !variantName.trim()) {
      toast.error("Variant name is required");
      return;
    }

    try {
      const res = await fetch(`/api/v1/inventory/${id}/variants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name: variantName.trim(),
          sku: variantSku || undefined,
          purchasePrice: variantPurchasePrice ? Math.round(parseFloat(variantPurchasePrice) * 100) : undefined,
          salePrice: variantSalePrice ? Math.round(parseFloat(variantSalePrice) * 100) : undefined,
          quantityOnHand: variantQuantity ? parseInt(variantQuantity) : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add variant");
      }

      const data = await res.json();
      setVariants(prev => [...prev, data.variant]);
      setAddVariantOpen(false);
      setVariantName("");
      setVariantSku("");
      setVariantPurchasePrice("");
      setVariantSalePrice("");
      setVariantQuantity("");
      toast.success("Variant added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add variant");
    }
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="movements"><Clock className="size-3 mr-1.5" />History</TabsTrigger>
            <TabsTrigger value="suppliers"><Truck className="size-3 mr-1.5" />Suppliers</TabsTrigger>
            <TabsTrigger value="variants"><Layers className="size-3 mr-1.5" />Variants</TabsTrigger>
          </TabsList>

          {/* Details tab - existing form */}
          <TabsContent value="details" className="space-y-10 mt-6">
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
          </TabsContent>

          {/* Movements tab */}
          <TabsContent value="movements" className="mt-6">
            {movementsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : movements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Clock className="size-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No stock movements yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Movements will appear here when stock is adjusted, purchased, or sold.</p>
              </div>
            ) : (
              <div className="rounded-xl border bg-card divide-y">
                {movements.map((m: any, i: number) => {
                  const qty = m.quantityChange ?? m.adjustment ?? 0;
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
                            isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
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
            )}
          </TabsContent>

          {/* Suppliers tab */}
          <TabsContent value="suppliers" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Linked Suppliers</h3>
              <Button size="sm" variant="outline" onClick={() => setLinkSupplierOpen(true)}>
                <Link2 className="mr-1.5 size-3.5" />
                Link Supplier
              </Button>
            </div>
            {suppliersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : suppliers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Truck className="size-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No suppliers linked</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Link suppliers to track purchasing sources and lead times.</p>
              </div>
            ) : (
              <div className="rounded-xl border bg-card divide-y">
                {suppliers.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-4 p-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.contactName || s.contact?.name || s.contactId}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {s.supplierCode && (
                          <span className="text-xs text-muted-foreground">Code: {s.supplierCode}</span>
                        )}
                        {s.leadTimeDays != null && (
                          <span className="text-xs text-muted-foreground">Lead: {s.leadTimeDays}d</span>
                        )}
                        {s.purchasePrice != null && (
                          <span className="text-xs text-muted-foreground">Price: {formatMoney(s.purchasePrice)}</span>
                        )}
                        {s.isPreferred && (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px]">
                            Preferred
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                      onClick={() => handleUnlinkSupplier(s.id)}
                    >
                      <Unlink className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Variants tab */}
          <TabsContent value="variants" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Variants</h3>
              <Button size="sm" variant="outline" onClick={() => setAddVariantOpen(true)}>
                <Plus className="mr-1.5 size-3.5" />
                Add Variant
              </Button>
            </div>
            {variantsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : variants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Layers className="size-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No variants</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Add variants for different sizes, colors, or configurations.</p>
              </div>
            ) : (
              <div className="rounded-xl border bg-card divide-y">
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
          </TabsContent>
        </Tabs>

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

        {/* Link supplier sheet */}
        <Sheet open={linkSupplierOpen} onOpenChange={setLinkSupplierOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Link Supplier</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 px-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Contact ID *</Label>
                <Input
                  value={supplierContactId}
                  onChange={(e) => setSupplierContactId(e.target.value)}
                  placeholder="Paste supplier contact UUID"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Supplier Code</Label>
                <Input
                  value={supplierCode}
                  onChange={(e) => setSupplierCode(e.target.value)}
                  placeholder="Optional supplier code"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Lead Time (days)</Label>
                <Input
                  type="number"
                  min={0}
                  value={supplierLeadDays}
                  onChange={(e) => setSupplierLeadDays(e.target.value)}
                  placeholder="e.g. 14"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Purchase Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={supplierPrice}
                  onChange={(e) => setSupplierPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="supplierPreferred"
                  checked={supplierPreferred}
                  onCheckedChange={(checked) => setSupplierPreferred(checked === true)}
                />
                <Label htmlFor="supplierPreferred" className="text-xs cursor-pointer">Preferred supplier</Label>
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setLinkSupplierOpen(false)}>Cancel</Button>
              <Button onClick={handleLinkSupplier} className="bg-emerald-600 hover:bg-emerald-700">
                Link Supplier
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* Add variant sheet */}
        <Sheet open={addVariantOpen} onOpenChange={setAddVariantOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Add Variant</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 px-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Name *</Label>
                <Input
                  value={variantName}
                  onChange={(e) => setVariantName(e.target.value)}
                  placeholder="e.g. Large / Red"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SKU</Label>
                <Input
                  value={variantSku}
                  onChange={(e) => setVariantSku(e.target.value)}
                  placeholder="Optional variant SKU"
                />
              </div>
              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Purchase Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={variantPurchasePrice}
                    onChange={(e) => setVariantPurchasePrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Sale Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={variantSalePrice}
                    onChange={(e) => setVariantSalePrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity on Hand</Label>
                <Input
                  type="number"
                  min={0}
                  value={variantQuantity}
                  onChange={(e) => setVariantQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Variant options (e.g. size, color) can be configured via the API.
              </p>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setAddVariantOpen(false)}>Cancel</Button>
              <Button onClick={handleAddVariant} className="bg-emerald-600 hover:bg-emerald-700">
                Add Variant
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {confirmDialog}
      </ContentReveal>
    </div>
  );
}

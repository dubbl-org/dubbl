"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Save, Loader2 } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { centsToDecimal } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { setEntityTitle } from "@/lib/hooks/use-entity-title";
import { useInventoryItem } from "./layout";

export default function InventoryItemDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { item, setItem } = useInventoryItem();
  const [saving, setSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

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
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    await fetch(`/api/v1/inventory/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    toast.success("Item deleted");
    router.push("/inventory");
  }

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
      {confirmDialog}
    </>
  );
}

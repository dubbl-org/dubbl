"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Truck, Link2, Unlink } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";

export default function InventoryItemSuppliersPage() {
  const { id } = useParams<{ id: string }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [linkOpen, setLinkOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [supplierCode, setSupplierCode] = useState("");
  const [leadDays, setLeadDays] = useState("");
  const [price, setPrice] = useState("");
  const [preferred, setPreferred] = useState(false);

  function fetchSuppliers() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/inventory/${id}/suppliers`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => { if (data.data) setSuppliers(data.data); })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchSuppliers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleLink() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !contactId.trim()) {
      toast.error("Contact ID is required");
      return;
    }

    try {
      const res = await fetch(`/api/v1/inventory/${id}/suppliers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          contactId: contactId.trim(),
          supplierCode: supplierCode || undefined,
          leadTimeDays: leadDays ? parseInt(leadDays) : undefined,
          purchasePrice: price ? Math.round(parseFloat(price) * 100) : undefined,
          isPreferred: preferred,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to link supplier");
      }

      setLinkOpen(false);
      fetchSuppliers();
      setContactId("");
      setSupplierCode("");
      setLeadDays("");
      setPrice("");
      setPreferred(false);
      toast.success("Supplier linked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link supplier");
    }
  }

  async function handleUnlink(supplierId: string) {
    const confirmed = await confirm({
      title: "Unlink this supplier?",
      description: "This will remove the supplier link from this item.",
      confirmLabel: "Unlink",
      destructive: true,
    });
    if (!confirmed) return;

    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch(`/api/v1/inventory/${id}/suppliers/${supplierId}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error("Failed to unlink");
      setSuppliers((prev) => prev.filter((s) => s.id !== supplierId));
      toast.success("Supplier unlinked");
    } catch {
      toast.error("Failed to unlink supplier");
    }
  }

  if (loading) return <BrandLoader />;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Linked Suppliers</h3>
        <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
          <Link2 className="mr-1.5 size-3.5" />
          Link Supplier
        </Button>
      </div>

      {suppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No suppliers linked"
          description="Link suppliers to track purchasing sources and lead times."
          compact
        >
          <Button size="sm" onClick={() => setLinkOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Link2 className="mr-1.5 size-3.5" />
            Link Supplier
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-xl border bg-card divide-y">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
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
                onClick={() => handleUnlink(s.id)}
              >
                <Unlink className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Sheet open={linkOpen} onOpenChange={setLinkOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Link Supplier</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Supplier *</Label>
              <ContactPicker
                value={contactId}
                onChange={setContactId}
                type="supplier"
                placeholder="Select supplier..."
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
                value={leadDays}
                onChange={(e) => setLeadDays(e.target.value)}
                placeholder="e.g. 14"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Purchase Price</Label>
              <CurrencyInput
                prefix="$"
                value={price}
                onChange={setPrice}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="supplierPreferred"
                checked={preferred}
                onCheckedChange={(checked) => setPreferred(checked === true)}
              />
              <Label htmlFor="supplierPreferred" className="text-xs cursor-pointer">Preferred supplier</Label>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button onClick={handleLink} className="bg-emerald-600 hover:bg-emerald-700">
              Link Supplier
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </>
  );
}

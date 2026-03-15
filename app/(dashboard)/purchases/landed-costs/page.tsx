"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Plus, Trash2 } from "lucide-react";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { toast } from "sonner";

interface CostComponent {
  description: string;
  amount: string;
  accountId: string;
}

interface LandedCost {
  id: string;
  name: string;
  allocationMethod: string;
  totalCostAmount: number;
  status: string;
  createdAt: string;
  purchaseOrder?: { poNumber: string } | null;
  bill?: { billNumber: string } | null;
}

const formatMoney = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function LandedCostsPage() {
  const router = useRouter();
  const [items, setItems] = useState<LandedCost[]>([]);
  const [loading, setLoading] = useState(true);

  useDocumentTitle("Purchases · Landed Costs");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [billId, setBillId] = useState("");
  const [allocationMethod, setAllocationMethod] = useState("by_value");
  const [components, setComponents] = useState<CostComponent[]>([
    { description: "", amount: "", accountId: "" },
  ]);

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId") || ""
      : "";

  const fetchItems = useCallback(() => {
    if (!orgId) return;
    fetch("/api/v1/landed-costs", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setItems(data.data);
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function resetForm() {
    setName("");
    setPurchaseOrderId("");
    setBillId("");
    setAllocationMethod("by_value");
    setComponents([{ description: "", amount: "", accountId: "" }]);
  }

  function updateComponent(index: number, updates: Partial<CostComponent>) {
    setComponents((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...updates } : c))
    );
  }

  function addComponent() {
    setComponents((prev) => [
      ...prev,
      { description: "", amount: "", accountId: "" },
    ]);
  }

  function removeComponent(index: number) {
    if (components.length <= 1) return;
    setComponents((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (components.some((c) => !c.description.trim() || !c.amount)) {
      toast.error("All components need a description and amount");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/v1/landed-costs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name,
          purchaseOrderId: purchaseOrderId || null,
          billId: billId || null,
          allocationMethod,
          components: components.map((c) => ({
            description: c.description,
            amount: parseFloat(c.amount) || 0,
            accountId: c.accountId || null,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create");
      }

      toast.success("Landed cost allocation created");
      setSheetOpen(false);
      resetForm();
      fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  async function handleAllocate(id: string) {
    try {
      const res = await fetch(`/api/v1/landed-costs/${id}/allocate`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to allocate");
      }

      toast.success("Costs allocated successfully");
      fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to allocate");
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/v1/landed-costs/${id}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }

      toast.success("Allocation deleted");
      fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Landed Costs
          </h1>
          <p className="text-sm text-muted-foreground">
            Allocate additional costs to purchase orders
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setSheetOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="mr-2 size-4" />
          New Allocation
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>PO / Bill</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Total Cost</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-8"
                >
                  No landed cost allocations yet
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(`/purchases/landed-costs/${item.id}`)
                  }
                >
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.purchaseOrder?.poNumber ||
                      item.bill?.billNumber ||
                      "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.allocationMethod.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatMoney(item.totalCostAmount)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.status === "draft" ? "secondary" : "default"
                      }
                      className={
                        item.status === "allocated"
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : ""
                      }
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.status === "draft" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAllocate(item.id)}
                          >
                            Allocate
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(item.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* New Allocation Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(v) => {
          if (!v) resetForm();
          setSheetOpen(v);
        }}
      >
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b">
            <SheetTitle>New Allocation</SheetTitle>
          </SheetHeader>
          <form
            onSubmit={handleCreate}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name *</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Shipping costs for PO-001"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Purchase Order ID
                    </label>
                    <Input
                      value={purchaseOrderId}
                      onChange={(e) => setPurchaseOrderId(e.target.value)}
                      placeholder="PO ID"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Bill ID</label>
                    <Input
                      value={billId}
                      onChange={(e) => setBillId(e.target.value)}
                      placeholder="Bill ID"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Allocation Method
                  </label>
                  <Select
                    value={allocationMethod}
                    onValueChange={setAllocationMethod}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="by_value">By Value</SelectItem>
                      <SelectItem value="by_quantity">By Quantity</SelectItem>
                      <SelectItem value="by_weight">By Weight</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    Cost Components *
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addComponent}
                  >
                    <Plus className="mr-2 size-3.5" />
                    Add
                  </Button>
                </div>
                {components.map((comp, index) => (
                  <div key={index} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">
                        Component {index + 1}
                      </span>
                      {components.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeComponent(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium">
                        Description *
                      </label>
                      <Input
                        value={comp.description}
                        onChange={(e) =>
                          updateComponent(index, {
                            description: e.target.value,
                          })
                        }
                        placeholder="e.g. Freight charges"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Amount *</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={comp.amount}
                          onChange={(e) =>
                            updateComponent(index, { amount: e.target.value })
                          }
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium">
                          Account ID
                        </label>
                        <Input
                          value={comp.accountId}
                          onChange={(e) =>
                            updateComponent(index, {
                              accountId: e.target.value,
                            })
                          }
                          placeholder="Account ID"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-4 py-3 sm:px-6 sm:py-4 backdrop-blur-sm">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {saving ? "Creating..." : "Create Allocation"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

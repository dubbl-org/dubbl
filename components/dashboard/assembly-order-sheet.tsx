"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/query/use-api";

/** Send JSON to an org-scoped API route, throwing the API's error message. */
export async function sendJson<T = Record<string, unknown>>(url: string, method: string, body?: unknown): Promise<T> {
  const orgId = localStorage.getItem("activeOrgId");
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...(orgId ? { "x-organization-id": orgId } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong");
  return data as T;
}

interface BomOption {
  id: string;
  name: string;
  isActive: boolean;
  assemblyItem: { name: string } | null;
  components: {
    id: string;
    quantity: string;
    wastagePercent: string | null;
    componentItem: { id: string; name: string; quantityOnHand: number } | null;
  }[];
  costBreakdown?: { totalCost: number };
}

/** Units of a part a build uses: per unit x quantity, plus wastage, rounded up. */
function unitsNeeded(perUnit: string, quantity: number, wastage: string | null) {
  const raw = parseFloat(perUnit) * quantity * (1 + parseFloat(wastage || "0") / 100);
  return Math.ceil(Math.round(raw * 1e6) / 1e6);
}

/**
 * "New assembly order" sheet: pick a bill of materials and how many to build.
 * Shows the parts the build will use against what's on hand.
 */
export function AssemblyOrderSheet({
  open,
  onOpenChange,
  bomId: fixedBomId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select (and lock) a bill of materials. */
  bomId?: string;
}) {
  const { data } = useApi<{ data?: BomOption[] }>(open ? "/api/v1/inventory/bom" : null);
  const boms = (data?.data ?? []).filter((b) => b.isActive || b.id === fixedBomId);
  const [pickedBomId, setPickedBomId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const bomId = fixedBomId ?? pickedBomId;
  const bom = boms.find((b) => b.id === bomId);
  const qty = Math.max(0, parseInt(quantity) || 0);

  async function save() {
    if (!bomId) {
      toast.error("Pick a bill of materials");
      return;
    }
    if (qty < 1) {
      toast.error("Build at least 1");
      return;
    }
    setSaving(true);
    try {
      await sendJson("/api/v1/inventory/assembly-orders", "POST", { bomId, quantity: qty, notes: notes.trim() || null });
      toast.success("Assembly order created");
      setPickedBomId("");
      setQuantity("1");
      setNotes("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New assembly order</SheetTitle>
          <SheetDescription>
            Plan a build. Parts are used up and the finished items are added to stock when you complete the order.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Bill of materials *</Label>
            <Select value={bomId} onValueChange={setPickedBomId} disabled={!!fixedBomId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={boms.length ? "Pick what to build" : "No bills of materials yet"} />
              </SelectTrigger>
              <SelectContent>
                {boms.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                    {b.assemblyItem ? ` (makes ${b.assemblyItem.name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Quantity to build *</Label>
            <Input type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
          </div>

          {bom && qty > 0 && (
            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-medium">
                <span>Parts this build uses</span>
                {bom.costBreakdown && (
                  <span className="text-muted-foreground">Est. {formatMoney(bom.costBreakdown.totalCost * qty)}</span>
                )}
              </div>
              {bom.components.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">This bill of materials has no parts yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="px-3 py-1.5 text-left font-medium">Part</th>
                      <th className="px-3 py-1.5 text-right font-medium">Needed</th>
                      <th className="px-3 py-1.5 text-right font-medium">On hand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bom.components.map((c) => {
                      const need = unitsNeeded(c.quantity, qty, c.wastagePercent);
                      const have = c.componentItem?.quantityOnHand ?? 0;
                      return (
                        <tr key={c.id} className="border-t">
                          <td className="px-3 py-1.5">{c.componentItem?.name ?? "Unknown item"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{need}</td>
                          <td className={cn("px-3 py-1.5 text-right tabular-nums", have < need && "font-medium text-red-600")}>{have}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>Create order</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

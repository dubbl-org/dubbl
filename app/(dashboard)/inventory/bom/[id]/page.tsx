"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Pencil, Plus, Trash2, Hammer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { InventoryItemPicker } from "@/components/dashboard/inventory-item-picker";
import { AssemblyOrderSheet, sendJson } from "@/components/dashboard/assembly-order-sheet";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { centsToDecimal, decimalToCents, formatMoney } from "@/lib/money";
import { useApi } from "@/lib/query/use-api";

interface ComponentItem {
  id: string;
  name: string;
  code: string;
  purchasePrice: number;
  averageCost: number;
  totalValue: number;
  quantityOnHand: number;
}

interface BOMComponent {
  id: string;
  quantity: string;
  wastagePercent: string | null;
  componentItem: ComponentItem | null;
}

interface BOMDetail {
  bom: {
    id: string;
    name: string;
    description: string | null;
    assemblyItem: { id: string; name: string; code: string } | null;
    laborCostCents: number;
    overheadCostCents: number;
    isActive: boolean;
    components: BOMComponent[];
  };
  costBreakdown: {
    componentCost: number;
    laborCost: number;
    overheadCost: number;
    totalCost: number;
  };
}

/** Book cost per unit, matching the server estimate. */
function unitCost(item: ComponentItem) {
  if (item.quantityOnHand > 0) return Math.round(item.totalValue / item.quantityOnHand);
  return item.averageCost || item.purchasePrice || 0;
}

export default function BOMDetailPage() {
  const { id } = useParams<{ id: string }>();
  const url = `/api/v1/inventory/bom/${id}`;
  const { data, loading } = useApi<BOMDetail>(url);
  const { confirm, dialog: confirmDialog } = useConfirm();
  useDocumentTitle("Inventory · BOM Details");

  // Details sheet
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [labor, setLabor] = useState("");
  const [overhead, setOverhead] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Part sheet (add or edit)
  const [partOpen, setPartOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<BOMComponent | null>(null);
  const [partItemId, setPartItemId] = useState("");
  const [partQty, setPartQty] = useState("1");
  const [partWastage, setPartWastage] = useState("");

  const [orderOpen, setOrderOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (loading) return <BrandLoader />;
  if (!data?.bom) return <div className="py-20 text-center text-sm text-muted-foreground">Bill of materials not found</div>;

  const { bom, costBreakdown } = data;

  function openDetails() {
    setName(bom.name);
    setDescription(bom.description ?? "");
    setLabor(bom.laborCostCents ? centsToDecimal(bom.laborCostCents) : "");
    setOverhead(bom.overheadCostCents ? centsToDecimal(bom.overheadCostCents) : "");
    setIsActive(bom.isActive);
    setDetailsOpen(true);
  }

  function openPart(part: BOMComponent | null) {
    setEditingPart(part);
    setPartItemId(part?.componentItem?.id ?? "");
    setPartQty(part ? String(parseFloat(part.quantity)) : "1");
    setPartWastage(part?.wastagePercent && parseFloat(part.wastagePercent) > 0 ? String(parseFloat(part.wastagePercent)) : "");
    setPartOpen(true);
  }

  async function saveDetails() {
    if (!name.trim()) return toast.error("Give it a name");
    setSaving(true);
    try {
      await sendJson(url, "PATCH", {
        name: name.trim(),
        description: description.trim() || null,
        laborCostCents: labor ? decimalToCents(labor) : 0,
        overheadCostCents: overhead ? decimalToCents(overhead) : 0,
        isActive,
      });
      toast.success("Saved");
      setDetailsOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function savePart() {
    const quantity = parseFloat(partQty);
    const wastagePercent = partWastage ? parseFloat(partWastage) : 0;
    if (!editingPart && !partItemId) return toast.error("Pick a part");
    if (!(quantity > 0)) return toast.error("Quantity per unit must be more than 0");
    if (!(wastagePercent >= 0)) return toast.error("Wastage can't be negative");
    setSaving(true);
    try {
      if (editingPart) {
        await sendJson(`${url}/components/${editingPart.id}`, "PATCH", { quantity, wastagePercent });
        toast.success("Part updated");
      } else {
        await sendJson(`${url}/components`, "POST", { componentItemId: partItemId, quantity, wastagePercent });
        toast.success("Part added");
      }
      setPartOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the part");
    } finally {
      setSaving(false);
    }
  }

  async function removePart(part: BOMComponent) {
    await confirm({
      title: `Remove ${part.componentItem?.name ?? "this part"}?`,
      description: "Future builds won't use it. Past builds stay as they are.",
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: async () => {
        try {
          await sendJson(`${url}/components/${part.id}`, "DELETE");
          toast.success("Part removed");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Couldn't remove it");
          throw err;
        }
      },
    });
  }

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{bom.name}</h2>
              {!bom.isActive && <Badge variant="outline">Inactive</Badge>}
            </div>
            {bom.description && <p className="text-sm text-muted-foreground mt-1">{bom.description}</p>}
            <p className="text-xs text-muted-foreground mt-1">
              Makes: {bom.assemblyItem?.name || "Unknown"}
              {bom.assemblyItem?.code ? ` (${bom.assemblyItem.code})` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={openDetails}>
              <Pencil className="mr-1.5 size-3.5" />
              Edit details
            </Button>
            <Button size="sm" onClick={() => setOrderOpen(true)} disabled={!bom.isActive || bom.components.length === 0}>
              <Hammer className="mr-1.5 size-3.5" />
              New assembly order
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-medium">Cost to build one</h3>
          <p className="mb-3 text-xs text-muted-foreground">An estimate from the parts&apos; current cost. A build uses the actual cost at the time.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Parts</p>
              <p className="text-sm font-mono font-medium tabular-nums">{formatMoney(costBreakdown.componentCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Labour</p>
              <p className="text-sm font-mono font-medium tabular-nums">{formatMoney(costBreakdown.laborCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overhead</p>
              <p className="text-sm font-mono font-medium tabular-nums">{formatMoney(costBreakdown.overheadCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total cost</p>
              <p className="text-sm font-mono font-semibold tabular-nums">{formatMoney(costBreakdown.totalCost)}</p>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">Parts ({bom.components.length})</h3>
            <Button size="sm" variant="outline" onClick={() => openPart(null)}>
              <Plus className="mr-1.5 size-3.5" />
              Add part
            </Button>
          </div>
          {bom.components.length === 0 ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              No parts yet. Add the items that go into one {bom.assemblyItem?.name ?? "finished item"}.
            </div>
          ) : (
            <div className="space-y-1">
              {bom.components.map((comp) => {
                const wastage = parseFloat(comp.wastagePercent || "0");
                return (
                  <div key={comp.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {comp.componentItem?.name || "Unknown"}
                        {comp.componentItem?.code ? ` (${comp.componentItem.code})` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {parseFloat(comp.quantity)} per unit
                        {wastage > 0 && ` · ${wastage}% wastage`}
                        {comp.componentItem && ` · ${formatMoney(unitCost(comp.componentItem))} each · ${comp.componentItem.quantityOnHand} on hand`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => openPart(comp)} aria-label="Edit part">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="size-7 p-0 text-destructive" onClick={() => removePart(comp)} aria-label="Remove part">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit details</SheetTitle>
            <SheetDescription>Changes apply to future builds only.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Labour per unit</Label>
                <CurrencyInput prefix="$" value={labor} onChange={setLabor} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Overhead per unit</Label>
                <CurrencyInput prefix="$" value={overhead} onChange={setOverhead} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label className="text-xs" htmlFor="bom-active">Active</Label>
              <Switch id="bom-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>Cancel</Button>
            <Button onClick={saveDetails} disabled={saving}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={partOpen} onOpenChange={setPartOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingPart ? "Edit part" : "Add part"}</SheetTitle>
            <SheetDescription>How much of this item goes into one {bom.assemblyItem?.name ?? "finished item"}.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Part *</Label>
              {editingPart ? (
                <p className="rounded-md border px-3 py-2 text-sm">{editingPart.componentItem?.name ?? "Unknown item"}</p>
              ) : (
                <InventoryItemPicker value={partItemId} onChange={(itemId) => setPartItemId(itemId)} placeholder="Pick a stock item" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity per unit *</Label>
                <Input type="number" min={0} step="any" value={partQty} onChange={(e) => setPartQty(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Wastage %</Label>
                <Input type="number" min={0} step="any" value={partWastage} onChange={(e) => setPartWastage(e.target.value)} placeholder="0" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              A build uses quantity x units built, plus wastage, rounded up to whole units.
            </p>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setPartOpen(false)}>Cancel</Button>
            <Button onClick={savePart} disabled={saving}>{editingPart ? "Save" : "Add part"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AssemblyOrderSheet open={orderOpen} onOpenChange={setOrderOpen} bomId={bom.id} />
      {confirmDialog}
    </ContentReveal>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, Trash2, MoreHorizontal, ExternalLink, Layers, Calculator, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { decimalToCents, formatMoney } from "@/lib/money";
import { useApi } from "@/lib/query/use-api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { InventoryItemPicker } from "@/components/dashboard/inventory-item-picker";
import { sendJson } from "@/components/dashboard/assembly-order-sheet";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface BOM {
  id: string;
  name: string;
  description: string | null;
  assemblyItem: { id: string; name: string; code: string } | null;
  components: { id: string; componentItem: { name: string; purchasePrice: number } | null; quantity: string }[];
  laborCostCents: number;
  overheadCostCents: number;
  isActive: boolean;
  costBreakdown?: { totalCost: number };
}

/** "New bill of materials": the finished item, a name, and per-unit labour and overhead. */
function NewBomSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [itemId, setItemId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [labor, setLabor] = useState("");
  const [overhead, setOverhead] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!itemId) return toast.error("Pick the item this makes");
    if (!name.trim()) return toast.error("Give it a name");
    setSaving(true);
    try {
      const res = await sendJson<{ bom?: { id: string } }>("/api/v1/inventory/bom", "POST", {
        assemblyItemId: itemId,
        name: name.trim(),
        description: description.trim() || null,
        laborCostCents: labor ? decimalToCents(labor) : 0,
        overheadCostCents: overhead ? decimalToCents(overhead) : 0,
      });
      toast.success("Bill of materials created. Now add its parts.");
      onOpenChange(false);
      setItemId("");
      setName("");
      setDescription("");
      setLabor("");
      setOverhead("");
      if (res.bom?.id) router.push(`/inventory/bom/${res.bom.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create it");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New bill of materials</SheetTitle>
          <SheetDescription>The recipe for an item you build. You add the parts on the next page.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Makes *</Label>
            <InventoryItemPicker
              value={itemId}
              placeholder="Pick the finished item"
              onChange={(id, item) => {
                setItemId(id);
                if (item && !name.trim()) setName(item.name);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standing desk, standard build" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional" />
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
          <p className="text-xs text-muted-foreground">
            Labour and overhead are added to the cost of each finished item when you build it.
          </p>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>Create</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function BOMListPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { data, loading } = useApi<{ data?: BOM[] }>("/api/v1/inventory/bom");
  const boms = data?.data ?? [];
  const [sheetOpen, setSheetOpen] = useState(false);
  useDocumentTitle("Inventory · Bills of Materials");

  async function handleDelete(bom: BOM) {
    await confirm({
      title: `Delete "${bom.name}"?`,
      description: "The recipe is moved to the trash. Built items and past assembly orders stay as they are.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        try {
          await sendJson(`/api/v1/inventory/bom/${bom.id}`, "DELETE");
          toast.success("Bill of materials deleted");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Couldn't delete it");
          throw err;
        }
      },
    });
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Bills of materials</h2>
            <p className="text-sm text-muted-foreground">
              The parts that go into each item you build.
            </p>
          </div>
          <Button size="sm" onClick={() => setSheetOpen(true)}>
            <Plus className="mr-1.5 size-3.5" />
            New bill of materials
          </Button>
        </div>

        {boms.length === 0 ? (
          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start pt-4">
            {/* Left: mock BOM card */}
            <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
              <div className="bg-muted/30 px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Example bill of materials
                </p>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/40">
                    <Package className="size-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Standing Desk Frame</p>
                    <p className="text-xs text-muted-foreground font-mono">SKU-DESK-001</p>
                  </div>
                </div>
                <div className="h-px bg-border" />
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Components</p>
                <div className="space-y-1.5">
                  {[
                    { name: "Steel tubing (2m)", qty: "4", cost: "$12.00" },
                    { name: "Motor assembly", qty: "1", cost: "$45.00" },
                    { name: "Controller board", qty: "1", cost: "$28.00" },
                    { name: "Mounting brackets", qty: "8", cost: "$2.50" },
                  ].map((c) => (
                    <div key={c.name} className="flex items-center gap-3 text-sm">
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground font-mono tabular-nums">x{c.qty}</span>
                      <span className="text-xs font-mono tabular-nums w-16 text-right">{c.cost}</span>
                    </div>
                  ))}
                </div>
                <div className="h-px bg-border" />
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: "Materials", value: "$141.00" },
                    { label: "Labor", value: "$35.00" },
                    { label: "Total", value: "$176.00" },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg bg-muted/50 px-2 py-2">
                      <p className="text-sm font-bold font-mono tabular-nums">{value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: benefits */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                What BOMs help with
              </p>
              {[
                {
                  title: "Component recipes",
                  desc: "Define which parts and materials go into each finished product with exact quantities.",
                  icon: Layers,
                  color: "border-l-orange-400",
                },
                {
                  title: "Automatic cost rollup",
                  desc: "Calculate total product cost from components, labor, and overhead automatically.",
                  icon: Calculator,
                  color: "border-l-blue-400",
                },
                {
                  title: "Assembly orders",
                  desc: "Create work orders that deduct components and add finished items to inventory.",
                  icon: ListChecks,
                  color: "border-l-brand-400",
                },
                {
                  title: "Wastage tracking",
                  desc: "Account for material waste with per-component wastage percentages built into each recipe.",
                  icon: Package,
                  color: "border-l-violet-400",
                },
              ].map(({ title, desc, icon: Icon, color }) => (
                <div key={title} className={`rounded-lg border border-l-[3px] ${color} bg-card px-4 py-3`}>
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium">{title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 ml-[22px]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {boms.map((bom) => {
              const totalCost = bom.costBreakdown?.totalCost ?? bom.laborCostCents + bom.overheadCostCents;

              return (
                <div
                  key={bom.id}
                  className="flex items-center justify-between rounded-lg border bg-card p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => router.push(`/inventory/bom/${bom.id}`)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium">{bom.name}</h3>
                      {!bom.isActive && (
                        <Badge variant="outline" className="text-[10px]">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {bom.assemblyItem?.name || "Unknown item"} · {bom.components.length} {bom.components.length === 1 ? "part" : "parts"} · Est. {formatMoney(totalCost)} each
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="size-7 p-0" onClick={(e) => e.stopPropagation()}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/inventory/bom/${bom.id}`); }}>
                        <ExternalLink className="size-4" /> Open
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={(e) => { e.stopPropagation(); handleDelete(bom); }}>
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}

        <NewBomSheet open={sheetOpen} onOpenChange={setSheetOpen} />
        {confirmDialog}
      </div>
    </ContentReveal>
  );
}

"use client";

import { useState, useEffect } from "react";
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
import { formatMoney } from "@/lib/money";

interface BOM {
  id: string;
  name: string;
  description: string | null;
  assemblyItem: { id: string; name: string; code: string } | null;
  components: { id: string; componentItem: { name: string; purchasePrice: number } | null; quantity: string }[];
  laborCostCents: number;
  overheadCostCents: number;
  isActive: boolean;
}

export default function BOMListPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [boms, setBoms] = useState<BOM[]>([]);
  const [loading, setLoading] = useState(true);

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId };
  }

  useEffect(() => {
    fetch("/api/v1/inventory/bom", { headers: getHeaders() })
      .then((r) => r.json())
      .then((data) => { if (data.data) setBoms(data.data); })
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(bom: BOM) {
    await confirm({
      title: `Delete "${bom.name}"?`,
      description: "This bill of materials will be permanently deleted.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await fetch(`/api/v1/inventory/bom/${bom.id}`, { method: "DELETE", headers: getHeaders() });
        toast.success("BOM deleted");
        setBoms((prev) => prev.filter((b) => b.id !== bom.id));
      },
    });
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Bill of Materials</h2>
            <p className="text-sm text-muted-foreground">
              Define how finished products are assembled from components.
            </p>
          </div>
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
                  color: "border-l-emerald-400",
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
              const componentCost = bom.components.reduce((sum, c) => {
                return sum + parseFloat(c.quantity) * (c.componentItem?.purchasePrice || 0);
              }, 0);
              const totalCost = Math.round(componentCost) + bom.laborCostCents + bom.overheadCostCents;

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
                      {bom.assemblyItem?.name || "Unknown item"} · {bom.components.length} components · Est. {formatMoney(totalCost)}
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

        {confirmDialog}
      </div>
    </ContentReveal>
  );
}

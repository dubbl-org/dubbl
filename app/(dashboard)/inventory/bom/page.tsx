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
          <div className="relative flex min-h-[calc(100vh-14rem)] flex-col">
            {/* Ghost BOM rows */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-2">
              <div className="w-full max-w-2xl space-y-2">
                {[{ w1: 28, w2: 20 }, { w1: 32, w2: 16 }, { w1: 24, w2: 22 }, { w1: 36, w2: 18 }].map((row, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-muted/60 bg-card/40 p-4">
                    <div className="size-5 rounded bg-orange-200/30 dark:bg-orange-800/20" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 rounded bg-muted" style={{ width: `${row.w1 * 4}px` }} />
                      <div className="h-2 rounded bg-muted/30" style={{ width: `${row.w2 * 4}px` }} />
                    </div>
                    <div className="h-5 w-14 rounded-full border border-muted/40" />
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-b from-content-bg/20 via-content-bg/70 to-content-bg" />
            </div>

            {/* Centered content */}
            <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 sm:py-12 text-center">
              <div className="flex size-12 sm:size-14 items-center justify-center rounded-2xl bg-orange-100 dark:bg-orange-950/50">
                <Package className="size-6 sm:size-7 text-orange-600 dark:text-orange-400" />
              </div>
              <h2 className="mt-4 sm:mt-5 text-lg sm:text-xl font-semibold tracking-tight">Bill of Materials</h2>
              <p className="mt-2 max-w-md text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Define how finished products are assembled from raw components. Track material costs, labor, and overhead for accurate product costing.
              </p>
            </div>

            {/* Feature cards */}
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3 px-4 sm:px-0 pb-6 sm:pb-8">
              {[
                {
                  icon: Layers,
                  title: "Component recipes",
                  description: "Define which parts and materials go into each finished product with exact quantities.",
                  color: "text-orange-600 dark:text-orange-400",
                  bg: "bg-orange-50 dark:bg-orange-950/40",
                },
                {
                  icon: Calculator,
                  title: "Cost rollup",
                  description: "Automatically calculate total product cost from components, labor, and overhead.",
                  color: "text-blue-600 dark:text-blue-400",
                  bg: "bg-blue-50 dark:bg-blue-950/40",
                },
                {
                  icon: ListChecks,
                  title: "Assembly tracking",
                  description: "Create assembly orders that deduct components and add finished items to inventory.",
                  color: "text-emerald-600 dark:text-emerald-400",
                  bg: "bg-emerald-50 dark:bg-emerald-950/40",
                },
              ].map(({ icon: Icon, title, description, color, bg }) => (
                <div key={title} className="rounded-xl p-4 sm:p-5">
                  <div className={`flex size-9 items-center justify-center rounded-lg ${bg}`}>
                    <Icon className={`size-4.5 ${color}`} />
                  </div>
                  <h3 className="mt-3 text-[13px] font-semibold">{title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
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

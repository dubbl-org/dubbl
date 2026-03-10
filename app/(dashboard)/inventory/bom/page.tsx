"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Package, Plus, Trash2, MoreHorizontal, ExternalLink } from "lucide-react";
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
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <Package className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-medium">No BOMs yet</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a bill of materials to define assembly recipes.
            </p>
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

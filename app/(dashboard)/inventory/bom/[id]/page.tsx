"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Package, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";

interface BOMDetail {
  bom: {
    id: string;
    name: string;
    description: string | null;
    assemblyItem: { id: string; name: string; code: string } | null;
    laborCostCents: number;
    overheadCostCents: number;
    isActive: boolean;
    components: {
      id: string;
      quantity: string;
      wastagePercent: string | null;
      componentItem: { id: string; name: string; code: string; purchasePrice: number } | null;
    }[];
  };
  costBreakdown: {
    componentCost: number;
    laborCost: number;
    overheadCost: number;
    totalCost: number;
  };
}

export default function BOMDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<BOMDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useDocumentTitle("Inventory · BOM Details");

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId };
  }

  useEffect(() => {
    fetch(`/api/v1/inventory/bom/${id}`, { headers: getHeaders() })
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);

  async function removeComponent(componentId: string) {
    await fetch(`/api/v1/inventory/bom/${id}/components?componentId=${componentId}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    toast.success("Component removed");
    // Refetch
    const res = await fetch(`/api/v1/inventory/bom/${id}`, { headers: getHeaders() });
    setData(await res.json());
  }

  if (loading) return <BrandLoader />;
  if (!data) return <div className="py-20 text-center text-sm text-muted-foreground">BOM not found</div>;

  const { bom, costBreakdown } = data;

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{bom.name}</h2>
            {!bom.isActive && <Badge variant="outline">Inactive</Badge>}
          </div>
          {bom.description && (
            <p className="text-sm text-muted-foreground mt-1">{bom.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Produces: {bom.assemblyItem?.name || "Unknown"} ({bom.assemblyItem?.code})
          </p>
        </div>

        {/* Cost Breakdown */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-medium mb-3">Cost Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Components</p>
              <p className="text-sm font-mono font-medium tabular-nums">{formatMoney(costBreakdown.componentCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Labor</p>
              <p className="text-sm font-mono font-medium tabular-nums">{formatMoney(costBreakdown.laborCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overhead</p>
              <p className="text-sm font-mono font-medium tabular-nums">{formatMoney(costBreakdown.overheadCost)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Cost</p>
              <p className="text-sm font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(costBreakdown.totalCost)}</p>
            </div>
          </div>
        </div>

        {/* Components */}
        <div>
          <h3 className="text-sm font-medium mb-3">Components ({bom.components.length})</h3>
          {bom.components.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No components added yet
            </div>
          ) : (
            <div className="space-y-1">
              {bom.components.map((comp) => (
                <div key={comp.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {comp.componentItem?.name || "Unknown"} ({comp.componentItem?.code})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Qty: {comp.quantity}
                      {comp.wastagePercent && parseFloat(comp.wastagePercent) > 0 && ` · ${comp.wastagePercent}% wastage`}
                      {comp.componentItem && ` · ${formatMoney(comp.componentItem.purchasePrice)} each`}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="size-7 p-0 text-destructive" onClick={() => removeComponent(comp.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ContentReveal>
  );
}

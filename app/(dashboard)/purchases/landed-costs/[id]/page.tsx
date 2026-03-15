"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { toast } from "sonner";

interface CostComponent {
  id: string;
  description: string;
  amount: number;
  accountId: string | null;
}

interface LineAllocation {
  id: string;
  componentId: string;
  purchaseOrderLineId: string;
  allocatedAmount: number;
  allocationBasis: number;
}

interface LandedCostDetail {
  id: string;
  name: string;
  allocationMethod: string;
  totalCostAmount: number;
  status: string;
  createdAt: string;
  allocatedAt: string | null;
  purchaseOrder?: { poNumber: string } | null;
  bill?: { billNumber: string } | null;
  components: CostComponent[];
  lineAllocations: LineAllocation[];
}

const formatMoney = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function LandedCostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<LandedCostDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useDocumentTitle("Purchases · Landed Cost Details");

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId") || ""
      : "";

  const loadItem = useCallback(() => {
    if (!orgId) return;
    fetch(`/api/v1/landed-costs/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.id) setItem(data);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  async function handleAllocate() {
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
      loadItem();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to allocate");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <p className="text-sm text-muted-foreground">Allocation not found</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href="/purchases/landed-costs">Back to landed costs</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="size-8 p-0">
            <Link href="/purchases/landed-costs">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold tracking-tight">
                {item.name}
              </h1>
              <Badge
                variant={item.status === "draft" ? "secondary" : "default"}
                className={
                  item.status === "allocated"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : ""
                }
              >
                {item.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {item.allocationMethod.replace(/_/g, " ")} · Total{" "}
              {formatMoney(item.totalCostAmount)}
            </p>
          </div>
        </div>
        {item.status === "draft" && (
          <Button
            size="sm"
            onClick={handleAllocate}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Allocate
          </Button>
        )}
      </div>

      <div className="h-px bg-gradient-to-r from-blue-500/20 via-border to-transparent" />

      {/* PO / Bill reference */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {item.purchaseOrder && (
          <span>PO: {item.purchaseOrder.poNumber}</span>
        )}
        {item.bill && <span>Bill: {item.bill.billNumber}</span>}
        {!item.purchaseOrder && !item.bill && <span>No PO or Bill linked</span>}
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Cost</p>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums">
            {formatMoney(item.totalCostAmount)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Components</p>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums">
            {item.components.length}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Method</p>
          <p className="mt-1 text-xl font-bold truncate">
            {item.allocationMethod.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      {/* Cost components table */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Cost Components</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Account</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {item.components.map((comp) => (
                <TableRow key={comp.id}>
                  <TableCell className="font-medium">
                    {comp.description}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatMoney(comp.amount)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {comp.accountId || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Allocation results */}
      {item.status === "allocated" && item.lineAllocations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Allocation Results</h2>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Line ID</TableHead>
                  <TableHead>Component ID</TableHead>
                  <TableHead className="text-right">Basis</TableHead>
                  <TableHead className="text-right">
                    Allocated Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.lineAllocations.map((la) => (
                  <TableRow key={la.id}>
                    <TableCell className="font-mono text-sm">
                      {la.purchaseOrderLineId.slice(0, 8)}...
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {la.componentId.slice(0, 8)}...
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {la.allocationBasis}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatMoney(la.allocatedAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

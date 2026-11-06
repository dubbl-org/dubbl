"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useApi } from "@/lib/query/use-api";
import { decimalToCents, formatMoney } from "@/lib/money";
import { splitByBasis } from "@/lib/inventory/math";
import { sendJson } from "@/components/dashboard/assembly-order-sheet";

interface CostComponent {
  id: string;
  description: string;
  amount: number;
  accountId: string | null;
  account?: { id: string; code: string; name: string } | null;
}

interface LineAllocation {
  id: string;
  componentId: string;
  purchaseOrderLineId: string | null;
  allocatedAmount: number;
  allocationBasis: number | null;
}

interface PoLine {
  id: string;
  description: string;
  /** x100 */
  quantity: number;
  amount: number;
  sortOrder: number;
  inventoryItem: { id: string; name: string; code: string; quantityOnHand: number } | null;
  account?: { code: string; name: string } | null;
}

interface LandedCostDetail {
  id: string;
  name: string;
  allocationMethod: string;
  totalCostAmount: number;
  currencyCode: string;
  status: string;
  createdAt: string;
  allocatedAt: string | null;
  purchaseOrder?: { id: string; poNumber: string; lines: PoLine[]; contact?: { name: string } | null } | null;
  bill?: { id: string; billNumber: string } | null;
  journalEntry?: { id: string; entryNumber: number } | null;
  components: CostComponent[];
  lineAllocations: LineAllocation[];
}

const STATUS_LABEL: Record<string, string> = { draft: "Not applied", allocated: "Applied" };
const METHOD_LABEL: Record<string, string> = {
  by_value: "By value",
  by_quantity: "By quantity",
  by_weight: "By weight",
  manual: "Manual",
};

export default function LandedCostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading } = useApi<LandedCostDetail>(`/api/v1/landed-costs/${id}`);
  const item = data?.id ? data : null;
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [manual, setManual] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useDocumentTitle("Purchases · Landed Cost Details");

  if (loading) return <BrandLoader />;
  if (!item) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center">
        <p className="text-sm text-muted-foreground">Landed cost not found</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href="/purchases/landed-costs">Back to landed costs</Link>
        </Button>
      </div>
    );
  }

  const money = (cents: number) => formatMoney(cents, item.currencyCode);
  const lines = [...(item.purchaseOrder?.lines ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const applied = item.status === "allocated";
  const isManual = item.allocationMethod === "manual";

  // Share per PO line: the posted result once applied, else a preview.
  const shareByLine = new Map<string, number>();
  if (applied) {
    for (const la of item.lineAllocations) {
      if (la.purchaseOrderLineId) shareByLine.set(la.purchaseOrderLineId, (shareByLine.get(la.purchaseOrderLineId) ?? 0) + la.allocatedAmount);
    }
  } else if (isManual) {
    for (const l of lines) shareByLine.set(l.id, manual[l.id] ? decimalToCents(manual[l.id]) : 0);
  } else if (lines.length) {
    const bases = lines.map((l) => (item.allocationMethod === "by_quantity" ? l.quantity : l.amount));
    for (const c of item.components) {
      splitByBasis(c.amount, bases).forEach((v, i) => shareByLine.set(lines[i].id, (shareByLine.get(lines[i].id) ?? 0) + v));
    }
  }
  const manualTotal = isManual ? [...shareByLine.values()].reduce((s, v) => s + v, 0) : 0;
  const manualLeft = item.totalCostAmount - manualTotal;
  const stockShare = lines.filter((l) => l.inventoryItem).reduce((s, l) => s + (shareByLine.get(l.id) ?? 0), 0);

  async function handleApply() {
    if (!item) return;
    if (!item.purchaseOrder) return toast.error("Link a purchase order first");
    if (isManual && manualLeft !== 0) return toast.error(`The line amounts must add up to ${money(item.totalCostAmount)}`);
    const ok = await confirm({
      title: `Apply ${item.name}?`,
      description:
        "The costs are spread across the purchase order's lines and posted. Stock still on hand gets more expensive; the share for units already sold goes to cost of sales. This can't be undone.",
      confirmLabel: "Apply",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await sendJson<{ addedToStock?: number; toCostOfSales?: number }>(`/api/v1/landed-costs/${id}/allocate`, "POST", {
        ...(isManual ? { manualAmounts: lines.map((l) => ({ purchaseOrderLineId: l.id, amount: shareByLine.get(l.id) ?? 0 })) } : {}),
      });
      toast.success(
        `Applied · ${formatMoney(res.addedToStock ?? 0)} added to stock${res.toCostOfSales ? `, ${formatMoney(res.toCostOfSales)} to cost of sales` : ""}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't apply it");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="size-8 p-0">
            <Link href="/purchases/landed-costs" aria-label="Back to landed costs">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold tracking-tight">{item.name}</h1>
              <Badge variant={applied ? "default" : "secondary"}>{STATUS_LABEL[item.status] ?? item.status}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {METHOD_LABEL[item.allocationMethod] ?? item.allocationMethod} · Total {money(item.totalCostAmount)}
            </p>
          </div>
        </div>
        {!applied && (
          <Button size="sm" onClick={handleApply} disabled={busy || !item.purchaseOrder}>
            Apply to stock
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {item.purchaseOrder ? (
          <Link className="hover:text-foreground hover:underline" href={`/purchases/orders/${item.purchaseOrder.id}`}>
            Purchase order {item.purchaseOrder.poNumber}
            {item.purchaseOrder.contact?.name ? ` · ${item.purchaseOrder.contact.name}` : ""}
          </Link>
        ) : (
          <span>No purchase order linked. Link one to apply these costs.</span>
        )}
        {item.bill && (
          <Link className="hover:text-foreground hover:underline" href={`/purchases/${item.bill.id}`}>
            Bill {item.bill.billNumber}
          </Link>
        )}
        {item.journalEntry && (
          <Link className="hover:text-foreground hover:underline" href={`/accounting/${item.journalEntry.id}`}>
            Journal entry #{item.journalEntry.entryNumber}
          </Link>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Costs</h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Booked to</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {item.components.map((comp) => (
                <TableRow key={comp.id}>
                  <TableCell className="font-medium">{comp.description}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {comp.account ? `${comp.account.code} ${comp.account.name}` : "2160 Landed Costs Clearing"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{money(comp.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {item.purchaseOrder && (
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">{applied ? "How it was split" : isManual ? "Split it yourself" : "How it will be split"}</h2>
            <p className="text-xs text-muted-foreground">
              {isManual && !applied
                ? "Type the amount for each line. They must add up to the total."
                : "Shares for lines linked to a stock item go into that item's cost. Other lines' shares go to the line's account."}
            </p>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead>Stock item</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Line amount</TableHead>
                  <TableHead className="w-40 text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.description}</TableCell>
                    <TableCell className="text-sm">
                      {l.inventoryItem ? (
                        <span>
                          {l.inventoryItem.name} <span className="text-muted-foreground">({l.inventoryItem.quantityOnHand} on hand)</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not a stock item{l.account ? ` · ${l.account.code} ${l.account.name}` : ""}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.quantity / 100}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{money(l.amount)}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {isManual && !applied ? (
                        <CurrencyInput prefix="$" value={manual[l.id] ?? ""} onChange={(v) => setManual((m) => ({ ...m, [l.id]: v }))} />
                      ) : (
                        money(shareByLine.get(l.id) ?? 0)
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4} className="text-sm">
                    {isManual && !applied
                      ? manualLeft === 0
                        ? "Adds up to the total"
                        : `${money(Math.abs(manualLeft))} ${manualLeft > 0 ? "left to split" : "too much"}`
                      : `${money(stockShare)} goes to stock items`}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {money(isManual && !applied ? manualTotal : item.totalCostAmount)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          {lines.length > 0 && !lines.some((l) => l.inventoryItem) && (
            <p className="text-xs text-amber-600">
              None of this purchase order&apos;s lines are linked to a stock item, so applying won&apos;t change any stock costs. Edit the purchase order and pick a stock item on each line.
            </p>
          )}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

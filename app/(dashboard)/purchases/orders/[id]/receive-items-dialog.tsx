"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** A PO line as the PO API returns it (quantities x100). */
export interface ReceivableLine {
  id: string;
  description: string;
  quantity: number;
  quantityReceived: number;
}

const today = () => new Date().toISOString().split("T")[0];

/** Whole units still to come on a line (stored quantities are x100). */
function outstanding(l: ReceivableLine) {
  return Math.max(0, l.quantity - l.quantityReceived) / 100;
}

/**
 * Record a delivery against a purchase order. Each line starts at what's still
 * outstanding; lower it for a part delivery, or set it to 0 for items that
 * haven't come yet.
 */
export function ReceiveItemsDialog({
  purchaseOrderId,
  lines,
  open,
  onOpenChange,
  onReceived,
}: {
  purchaseOrderId: string;
  lines: ReceivableLine[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReceived: () => void;
}) {
  const pending = lines.filter((l) => outstanding(l) > 0);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset to the outstanding quantities each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQty(Object.fromEntries(pending.map((l) => [l.id, String(outstanding(l))])));
      setDate(today());
      setNotes("");
    }
  }

  async function handleSave() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    const receiving = pending
      .map((l) => ({ line: l, quantity: parseFloat(qty[l.id] ?? "") || 0 }))
      .filter((r) => r.quantity > 0);
    if (receiving.length === 0) {
      toast.error("Enter a quantity for at least one item");
      return;
    }
    const over = receiving.find((r) => r.quantity > outstanding(r.line));
    if (over) {
      toast.error(`Only ${outstanding(over.line)} of "${over.line.description}" is still to come`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/goods-receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          purchaseOrderId,
          date,
          notes: notes.trim() || null,
          lines: receiving.map((r) => ({ purchaseOrderLineId: r.line.id, quantity: r.quantity })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Couldn't record the items as received");
      }
      const all = receiving.length === pending.length && receiving.every((r) => r.quantity === outstanding(r.line));
      toast.success(all ? "All items marked as received" : "Part delivery recorded");
      onOpenChange(false);
      onReceived();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record the items as received");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark items as received</DialogTitle>
          <DialogDescription>
            Enter how many of each item arrived. For a part delivery, lower the number; set it to 0 for anything that hasn&apos;t come yet.
            Anything you track as stock is added to your inventory.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border">
            <div className="grid grid-cols-[1fr_80px_96px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Item</span>
              <span className="text-right">Still to come</span>
              <span className="text-right">Received now</span>
            </div>
            {pending.map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_80px_96px] items-center gap-2 border-b px-3 py-2 last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate text-sm">{l.description}</p>
                  {l.quantityReceived > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {l.quantityReceived / 100} of {l.quantity / 100} already in
                    </p>
                  )}
                </div>
                <span className="text-right text-sm font-mono tabular-nums">{outstanding(l)}</span>
                <Input
                  type="number"
                  min={0}
                  max={outstanding(l)}
                  step="any"
                  className="h-8 text-right"
                  value={qty[l.id] ?? ""}
                  onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                  aria-label={`Quantity of ${l.description} received`}
                />
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Date received</Label>
              <DatePicker value={date} onChange={setDate} placeholder="Date received" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional, e.g. delivery note number" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} className="bg-brand-600 hover:bg-brand-700">
            Mark as received
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

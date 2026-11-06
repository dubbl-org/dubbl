"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { LineItemsEditor, type LineItem } from "@/components/dashboard/line-items-editor";
import { minorUnitsToDecimal } from "@/lib/money";

/** The stored bill as GET /api/v1/bills/:id returns it (amounts in minor units, quantity x100). */
export interface EditableBill {
  id: string;
  billNumber: string;
  contactId: string;
  issueDate: string;
  dueDate: string;
  reference?: string | null;
  notes: string | null;
  currencyCode: string;
  lines: {
    description: string;
    quantity: number;
    unitPrice: number;
    accountId?: string | null;
    taxRateId?: string | null;
    discountPercent?: number | null;
    inventoryItemId?: string | null;
    warehouseId?: string | null;
    projectId?: string | null;
    goodsReceiptLineId?: string | null;
  }[];
}

// Editor rows keep the dimensions the editor doesn't show (stock item,
// warehouse, project, goods receipt line, discount) so saving doesn't drop them.
type EditLine = LineItem & {
  discountPercent?: number;
  inventoryItemId?: string | null;
  warehouseId?: string | null;
  projectId?: string | null;
  goodsReceiptLineId?: string | null;
};

function toEditLines(b: EditableBill): EditLine[] {
  return b.lines.map((l) => ({
    description: l.description,
    quantity: String(l.quantity / 100),
    unitPrice: minorUnitsToDecimal(l.unitPrice, b.currencyCode),
    accountId: l.accountId || "",
    taxRateId: l.taxRateId || "",
    discountPercent: l.discountPercent ?? 0,
    inventoryItemId: l.inventoryItemId ?? null,
    warehouseId: l.warehouseId ?? null,
    projectId: l.projectId ?? null,
    goodsReceiptLineId: l.goodsReceiptLineId ?? null,
  }));
}

/** Edit a draft bill: supplier, numbers, dates and every line. */
export function EditBillSheet({
  bill,
  open,
  onOpenChange,
  onSaved,
}: {
  bill: EditableBill;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [contactId, setContactId] = useState(bill.contactId);
  const [billNumber, setBillNumber] = useState(bill.billNumber);
  const [reference, setReference] = useState(bill.reference ?? "");
  const [issueDate, setIssueDate] = useState(bill.issueDate);
  const [dueDate, setDueDate] = useState(bill.dueDate);
  const [notes, setNotes] = useState(bill.notes ?? "");
  const [lines, setLines] = useState<EditLine[]>(() => toEditLines(bill));
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Start from the saved bill each time the sheet opens (not on every
  // background refetch, which would wipe what's being typed).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setContactId(bill.contactId);
      setBillNumber(bill.billNumber);
      setReference(bill.reference ?? "");
      setIssueDate(bill.issueDate);
      setDueDate(bill.dueDate);
      setNotes(bill.notes ?? "");
      setLines(toEditLines(bill));
      setDuplicate(null);
    }
  }

  async function save(confirmDuplicate: boolean) {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    if (!contactId) { toast.error("Choose a supplier"); return; }
    const filled = lines.filter((l) => l.description.trim());
    if (filled.length === 0) { toast.error("Add at least one line"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/bills/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          contactId,
          billNumber: billNumber.trim() || null,
          reference: reference.trim() || null,
          issueDate,
          dueDate,
          notes: notes.trim() || null,
          ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
          lines: filled.map((l) => ({
            description: l.description,
            quantity: parseFloat(l.quantity) || 1,
            unitPrice: parseFloat(l.unitPrice) || 0,
            accountId: l.accountId || null,
            taxRateId: l.taxRateId || null,
            discountPercent: l.discountPercent ?? 0,
            inventoryItemId: l.inventoryItemId ?? null,
            warehouseId: l.warehouseId ?? null,
            projectId: l.projectId ?? null,
            goodsReceiptLineId: l.goodsReceiptLineId ?? null,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.warning === "duplicate_bill") {
        setDuplicate(billNumber.trim());
        return;
      }
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Couldn't save the bill");
      toast.success("Bill updated");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the bill");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
              <Pencil className="size-5" />
            </div>
            <div>
              <SheetTitle className="text-lg">Edit bill</SheetTitle>
              <SheetDescription>Change anything on this draft before you add it to your books.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); setDuplicate(null); save(false); }}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Supplier *</Label>
                  <ContactPicker value={contactId} onChange={setContactId} type="supplier" />
                </div>
                <div className="space-y-2">
                  <Label>Supplier bill number</Label>
                  <Input value={billNumber} onChange={(e) => { setBillNumber(e.target.value); setDuplicate(null); }} placeholder="The number on their invoice" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Reference</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bill reference" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Issue Date</Label>
                  <DatePicker value={issueDate} onChange={setIssueDate} placeholder="Issue date" />
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <DatePicker value={dueDate} onChange={setDueDate} placeholder="Due date" />
                </div>
              </div>
              {duplicate && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
                  <p className="font-medium text-amber-800 dark:text-amber-300">
                    You already have a bill with number &ldquo;{duplicate}&rdquo; for this supplier.
                  </p>
                  <p className="mt-0.5 text-amber-700 dark:text-amber-400/90">This might be a duplicate. Save it anyway?</p>
                  <div className="mt-3 flex gap-2">
                    <Button type="button" size="sm" className="bg-amber-600 hover:bg-amber-700" disabled={saving} onClick={() => save(true)}>
                      Save anyway
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setDuplicate(null)}>
                      Go back
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Line Items</p>
              <LineItemsEditor
                lines={lines}
                onChange={(next) => setLines(next as EditLine[])}
                accountTypeFilter={["expense"]}
                taxContext="purchase"
                stockItems
              />
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." rows={3} />
            </div>
          </div>
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-4 py-3 sm:px-6 sm:py-4 backdrop-blur-sm">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700">
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

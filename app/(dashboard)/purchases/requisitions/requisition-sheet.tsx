"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { AccountPicker } from "@/components/dashboard/account-picker";
import { postJson } from "@/components/dashboard/explorer/action-button";
import { minorUnitsToDecimal } from "@/lib/money";

/** The parts of a saved requisition the edit form starts from. */
export interface EditableRequisition {
  id: string;
  contactId: string | null;
  requestDate: string;
  requiredDate: string | null;
  reference: string | null;
  notes: string | null;
  currencyCode: string;
  lines: {
    description: string;
    quantity: number;
    unitPrice: number;
    accountId: string | null;
    taxRateId: string | null;
  }[];
}

interface LineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  accountId: string;
  taxRateId: string | null;
}

const emptyLine = (): LineInput => ({ description: "", quantity: 1, unitPrice: 0, accountId: "", taxRateId: null });
const today = () => new Date().toISOString().split("T")[0];

/** PUT to an API route with the active workspace, returning the parsed body. */
async function putJson(url: string, body: unknown) {
  const orgId = localStorage.getItem("activeOrgId");
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json", ...(orgId ? { "x-organization-id": orgId } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong");
  return data;
}

/**
 * New and Edit requisition sheet. Without `requisition` it creates a draft;
 * with one it edits it (only drafts and rejected requests can be edited).
 */
export function RequisitionSheet({
  open,
  onOpenChange,
  requisition,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requisition?: EditableRequisition | null;
  onSaved: () => void;
}) {
  const editing = Boolean(requisition);
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState("");
  const [requestDate, setRequestDate] = useState(today());
  const [requiredDate, setRequiredDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineInput[]>([emptyLine()]);

  // Start from the saved requisition each time the sheet opens, or blank for a new one
  useEffect(() => {
    if (!open) return;
    setContactId(requisition?.contactId ?? "");
    setRequestDate(requisition?.requestDate ?? today());
    setRequiredDate(requisition?.requiredDate ?? "");
    setReference(requisition?.reference ?? "");
    setNotes(requisition?.notes ?? "");
    setLines(
      requisition?.lines.length
        ? requisition.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity / 100,
            unitPrice: Number(minorUnitsToDecimal(l.unitPrice, requisition.currencyCode)),
            accountId: l.accountId ?? "",
            taxRateId: l.taxRateId,
          }))
        : [emptyLine()]
    );
  }, [open, requisition]);

  function updateLine(idx: number, patch: Partial<LineInput>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function handleSave() {
    const validLines = lines.filter((l) => l.description.trim());
    if (validLines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    const body = {
      contactId: contactId || null,
      requestDate,
      requiredDate: requiredDate || null,
      reference: reference || null,
      notes: notes || null,
      lines: validLines.map((l) => ({ ...l, accountId: l.accountId || null })),
    };
    setSaving(true);
    try {
      if (requisition) await putJson(`/api/v1/purchase-requisitions/${requisition.id}`, body);
      else await postJson("/api/v1/purchase-requisitions", body);
      toast.success(editing ? "Requisition updated" : "Requisition created");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : editing ? "Failed to update requisition" : "Failed to create requisition");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-h-[85vh]">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit Requisition" : "New Purchase Requisition"}</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Supplier</Label>
            <ContactPicker value={contactId} onChange={setContactId} type="supplier" placeholder="Optional, needed before ordering" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Request Date</Label>
              <Input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Required By</Label>
              <Input type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional reference" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" rows={2} />
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Line Items</Label>
            {lines.map((line, idx) => (
              <div key={idx} className="flex items-start gap-2 rounded-lg border p-3">
                <div className="flex-1 space-y-2">
                  <Input placeholder="Description" value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Qty</Label>
                      <Input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Unit Price</Label>
                      <Input type="number" min={0} step={0.01} value={line.unitPrice} onChange={(e) => updateLine(idx, { unitPrice: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Account</Label>
                    <AccountPicker value={line.accountId} onChange={(v) => updateLine(idx, { accountId: v })} typeFilter={["expense", "asset"]} placeholder="Optional" />
                  </div>
                </div>
                {lines.length > 1 && (
                  <Button variant="ghost" size="icon" className="shrink-0 size-8 text-muted-foreground hover:text-red-600" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              <Plus className="mr-2 size-3.5" />
              Add Line
            </Button>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full bg-brand-600 hover:bg-brand-700">
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : editing ? <Check className="mr-2 size-4" /> : <Plus className="mr-2 size-4" />}
            {editing ? "Save Changes" : "Create Requisition"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

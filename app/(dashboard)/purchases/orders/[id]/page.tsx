"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Send, ShoppingCart, Pencil, Trash2, Plus, Package, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { DatePicker } from "@/components/ui/date-picker";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { AccountPicker } from "@/components/dashboard/account-picker";
import { InventoryItemPicker } from "@/components/dashboard/inventory-item-picker";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { useApi, useApiCache } from "@/lib/query/use-api";
import { ApprovalPanel, approvalStatusUrl, type ApprovalStatus } from "@/components/dashboard/approval-panel";
import { formatMoney, centsToDecimal } from "@/lib/money";
import { SendDocumentDialog } from "@/components/dashboard/send-document-dialog";
import { EmailHistory } from "@/components/dashboard/email-history";
import { ReceiveItemsDialog } from "./receive-items-dialog";
import Link from "next/link";

interface PODetail {
  id: string;
  poNumber: string;
  contactId: string;
  issueDate: string;
  deliveryDate: string | null;
  status: string;
  reference: string | null;
  notes: string | null;
  subtotal: number;
  total: number;
  contact: { name: string; email: string | null } | null;
  lines: {
    id: string;
    description: string;
    quantity: number;
    quantityReceived: number;
    quantityBilled: number;
    unitPrice: number;
    amount: number;
    discountPercent?: number;
    account: { id: string; code: string; name: string } | null;
    taxRate: { id: string } | null;
    inventoryItemId?: string | null;
    warehouseId?: string | null;
  }[];
}

interface EditLine {
  description: string;
  quantity: string;
  unitPrice: string;
  accountId: string;
  taxRateId: string;
  // Not editable here, but kept so saving doesn't drop a discount set elsewhere.
  discountPercent?: number;
  /** Stock item this line orders (kept with its location when saving). */
  inventoryItemId: string;
  warehouseId?: string | null;
}

const statusConfig: Record<string, { class: string }> = {
  draft: { class: "" },
  sent: { class: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  partial: { class: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  received: { class: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300" },
  closed: { class: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300" },
  void: { class: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300" },
};

// Plain-language status labels (end users aren't accountants).
const statusLabels: Record<string, string> = {
  draft: "draft",
  sent: "ordered",
  partial: "some items in",
  received: "all items in",
  closed: "fully billed",
  void: "cancelled",
};

// ---------------------------------------------------------------------------
// Drawer helper components
// ---------------------------------------------------------------------------

function DrawerIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function DrawerFooter({
  onClose,
  saving,
  label,
}: {
  onClose: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-4 py-3 sm:px-6 sm:py-4 backdrop-blur-sm">
      <Button type="button" variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button
        type="submit"
        disabled={saving}
        className="bg-brand-600 hover:bg-brand-700"
      >
        {saving ? "Saving..." : label}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit PO Drawer
// ---------------------------------------------------------------------------

function EditPODrawer({
  open,
  onClose,
  po,
}: {
  open: boolean;
  onClose: () => void;
  po: PODetail;
}) {
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);

  useEffect(() => {
    if (open) {
      setContactId(po.contactId);
      setIssueDate(po.issueDate);
      setDeliveryDate(po.deliveryDate || "");
      setNotes(po.notes || "");
      setLines(
        po.lines.map((l) => ({
          description: l.description,
          quantity: String(l.quantity / 100),
          unitPrice: centsToDecimal(l.unitPrice),
          accountId: l.account?.id || "",
          taxRateId: l.taxRate?.id || "",
          discountPercent: l.discountPercent ?? 0,
          inventoryItemId: l.inventoryItemId || "",
          warehouseId: l.warehouseId ?? null,
        }))
      );
    }
  }, [open, po]);

  function updateLine(index: number, updates: Partial<EditLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...updates } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { description: "", quantity: "1", unitPrice: "", accountId: "", taxRateId: "", inventoryItemId: "" }]);
  }

  function removeLine(index: number) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !contactId) {
      toast.error("Supplier is required");
      return;
    }
    if (lines.some((l) => !l.description.trim() || !l.unitPrice)) {
      toast.error("All lines need a description and price");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/v1/purchase-orders/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          contactId,
          issueDate,
          deliveryDate: deliveryDate || null,
          notes: notes || null,
          lines: lines.map((l) => ({
            description: l.description,
            quantity: parseFloat(l.quantity) || 1,
            unitPrice: parseFloat(l.unitPrice) || 0,
            accountId: l.accountId || null,
            taxRateId: l.taxRateId || null,
            discountPercent: l.discountPercent ?? 0,
            inventoryItemId: l.inventoryItemId || null,
            warehouseId: l.inventoryItemId ? l.warehouseId ?? null : null,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update");
      }

      toast.success("Purchase order updated");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <DrawerIcon><Package className="size-5" /></DrawerIcon>
            <div>
              <SheetTitle className="text-lg">Edit Purchase Order</SheetTitle>
              <SheetDescription>Update purchase order details.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <SectionLabel>Order Details</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Supplier *</Label>
                  <ContactPicker value={contactId} onChange={setContactId} type="supplier" />
                </div>
                <div className="space-y-2">
                  <Label>Issue Date</Label>
                  <DatePicker value={issueDate} onChange={setIssueDate} placeholder="Issue date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Delivery Date</Label>
                <DatePicker value={deliveryDate} onChange={setDeliveryDate} placeholder="Expected delivery" />
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <SectionLabel>Line Items</SectionLabel>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="mr-2 size-3.5" />Add Line
                </Button>
              </div>
              <div className="space-y-4">
                {lines.map((line, index) => (
                  <div key={index} className="rounded-lg border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Line {index + 1}</span>
                      {lines.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(index)} className="text-red-600 hover:text-red-700">
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2 sm:col-span-3">
                        <Label className="text-xs">Description *</Label>
                        <Input value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Quantity</Label>
                        <Input type="number" step="1" min="1" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Unit Price *</Label>
                        <CurrencyInput prefix="$" value={line.unitPrice} onChange={(v) => updateLine(index, { unitPrice: v })} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Account</Label>
                        <AccountPicker value={line.accountId} onChange={(val) => updateLine(index, { accountId: val })} typeFilter={["expense"]} />
                      </div>
                      <div className="space-y-2 sm:col-span-3">
                        <Label className="text-xs">Stock item</Label>
                        <InventoryItemPicker
                          value={line.inventoryItemId}
                          onChange={(itemId, item) =>
                            updateLine(index, {
                              inventoryItemId: itemId,
                              ...(item && !line.description.trim() ? { description: item.name } : {}),
                              ...(item && !line.unitPrice && item.purchasePrice ? { unitPrice: centsToDecimal(item.purchasePrice) } : {}),
                            })
                          }
                          placeholder="Not a stock item"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <SectionLabel>Notes</SectionLabel>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." rows={3} />
            </div>
          </div>
          <DrawerFooter onClose={onClose} saving={saving} label="Save Changes" />
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PODetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { data, loading } = useApi<{ purchaseOrder?: PODetail }>(`/api/v1/purchase-orders/${id}`);
  const po = data?.purchaseOrder ?? null;
  const cache = useApiCache();
  const [editOpen, setEditOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [emailHistoryKey, setEmailHistoryKey] = useState(0);
  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
  // An approval workflow can hold back sending a draft until it's approved.
  const { data: approval } = useApi<ApprovalStatus>(
    po?.status === "draft" ? approvalStatusUrl("purchase_order", id) : null
  );
  const approvalBlocked = !!approval?.blocked;

  useEntityTitle(po?.poNumber);

  const { data: orgData } = useApi<{ organization?: { name?: string } }>("/api/v1/organization");
  const orgName = orgData?.organization?.name || "";

  function handleSendComplete() {
    setEmailHistoryKey((k) => k + 1);
  }

  async function handleConvert() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/purchase-orders/${id}/convert`, { method: "POST", headers: { "x-organization-id": orgId } });
    if (res.ok) {
      const data = await res.json();
      toast.success("Bill created from this order");
      router.push(`/purchases/${data.bill.id}`);
    } else {
      toast.error("Couldn't create a bill from this order");
    }
  }

  // Record that the items you ordered have arrived. The dialog starts at the
  // quantities still outstanding; lower them for a part delivery.
  function handleReceiveItems() {
    if (!po) return;
    if (!po.lines.some((l) => l.quantity > l.quantityReceived)) {
      toast.info("All items on this order are already marked as received");
      return;
    }
    setReceiveOpen(true);
  }

  async function handleDelete() {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Delete this purchase order?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    const res = await fetch(`/api/v1/purchase-orders/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      toast.success("Purchase order deleted");
      router.push("/purchases/orders");
    } else {
      const data = await res.json();
      toast.error(typeof data.error === "string" ? data.error : "Failed to delete");
    }
  }

  if (loading) return <BrandLoader />;

  if (!po) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <p className="text-sm text-muted-foreground">Purchase order not found</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href="/purchases/orders">Back to orders</Link>
        </Button>
      </div>
    );
  }

  const sc = statusConfig[po.status] || statusConfig.draft;

  return (
    <ContentReveal>
      <div className="space-y-6">
        {/* Top bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="size-8 p-0">
              <Link href="/purchases/orders"><ArrowLeft className="size-4" /></Link>
            </Button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-semibold tracking-tight">{po.poNumber}</h1>
                <Badge variant="outline" className={sc.class}>{statusLabels[po.status] || po.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {po.contact?.name || "Unknown supplier"}
                {po.deliveryDate && <span> · Delivery {po.deliveryDate}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {po.status === "draft" && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-2 size-3.5" />Edit
                </Button>
                <Button
                  size="sm"
                  onClick={() => setSendDialogOpen(true)}
                  disabled={approvalBlocked}
                  title={approvalBlocked ? "This order needs approval before it can be sent" : undefined}
                  className="bg-brand-600 hover:bg-brand-700"
                >
                  <Send className="mr-2 size-3.5" />Send
                </Button>
                <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-600 hover:text-red-700">
                  <Trash2 className="mr-2 size-3.5" />Delete
                </Button>
              </>
            )}
            {["sent", "partial"].includes(po.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReceiveItems}
                title="Record that the items you ordered have arrived. Anything you track as stock is added to your inventory."
              >
                <PackageCheck className="mr-2 size-3.5" />Mark items as received
              </Button>
            )}
            {["sent", "partial", "received"].includes(po.status) && (
              <Button size="sm" onClick={handleConvert} className="bg-brand-600 hover:bg-brand-700" title="Turn this order into a bill you can pay">
                <ShoppingCart className="mr-2 size-3.5" />Create a bill from this order
              </Button>
            )}
          </div>
        </div>

        {/* Approval workflow: submit / approve / reject, and who's next */}
        {po.status === "draft" && <ApprovalPanel entityType="purchase_order" entityId={id} />}

        {/* Gradient divider */}
        <div className="h-px bg-gradient-to-r from-blue-500/20 via-border to-transparent" />

        {/* Info */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Issued {po.issueDate}</span>
          {po.deliveryDate && <span>Delivery {po.deliveryDate}</span>}
        </div>

        {po.notes && (
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{po.notes}</p>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="mt-1 text-xl font-bold font-mono tabular-nums">{formatMoney(po.total)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Items</p>
            <p className="mt-1 text-xl font-bold font-mono tabular-nums">{po.lines.length}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Supplier</p>
            <p className="mt-1 text-xl font-bold truncate">{po.contact?.name || "-"}</p>
          </div>
        </div>

        {/* Line items */}
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <div className="grid min-w-[500px] grid-cols-[1fr_80px_100px_120px] gap-2 border-b bg-muted/50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Price</span>
              <span className="text-right">Amount</span>
            </div>
            {po.lines.map((line) => (
              <div key={line.id} className="grid min-w-[500px] grid-cols-[1fr_80px_100px_120px] gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-muted/30 transition-colors">
                <div>
                  <p className="text-sm font-medium">{line.description}</p>
                  {line.account && (
                    <p className="text-xs text-muted-foreground">{line.account.code} · {line.account.name}</p>
                  )}
                  {line.quantityReceived > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {line.quantityReceived >= line.quantity
                        ? "All received"
                        : `${line.quantityReceived / 100} of ${line.quantity / 100} received`}
                    </p>
                  )}
                </div>
                <span className="text-right text-sm font-mono tabular-nums">{line.quantity / 100}</span>
                <span className="text-right text-sm font-mono tabular-nums">{formatMoney(line.unitPrice)}</span>
                <span className="text-right text-sm font-mono font-medium tabular-nums">{formatMoney(line.amount)}</span>
              </div>
            ))}
            {/* Total row */}
            <div className="grid min-w-[500px] grid-cols-[1fr_80px_100px_120px] gap-2 bg-muted/50 px-4 py-3">
              <span />
              <span />
              <span className="text-right text-sm font-semibold">Total</span>
              <span className="text-right text-sm font-mono font-bold tabular-nums">{formatMoney(po.total)}</span>
            </div>
          </div>
        </div>
      </div>

      <EmailHistory key={emailHistoryKey} documentType="purchase_order" documentId={id} />

      <ReceiveItemsDialog
        purchaseOrderId={id}
        lines={po.lines}
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        onReceived={() => cache.invalidate(`/api/v1/purchase-orders/${id}`)}
      />

      {/* Edit PO Drawer */}
      <EditPODrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        po={po}
      />

      <SendDocumentDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        documentType="purchase_order"
        documentId={id}
        documentNumber={po.poNumber}
        contactEmail={po.contact?.email}
        contactName={po.contact?.name}
        organizationName={orgName}
        amountDue={po.total}
        issueDate={po.issueDate}
        sendApiUrl={`/api/v1/purchase-orders/${id}/send`}
        onSent={handleSendComplete}
      />

      {confirmDialog}
    </ContentReveal>
  );
}

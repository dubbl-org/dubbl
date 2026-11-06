"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  Check,
  X,
  FileText,
  AlertCircle,
  Pencil,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { useApi } from "@/lib/query/use-api";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { postJson } from "@/components/dashboard/explorer/action-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RequisitionSheet, type EditableRequisition } from "../requisition-sheet";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";

interface RequisitionDetail {
  id: string;
  requisitionNumber: string;
  requestDate: string;
  requiredDate: string | null;
  status: string;
  reference: string | null;
  notes: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  rejectionReason: string | null;
  convertedPoId: string | null;
  contactId: string | null;
  currencyCode: string;
  contact: { name: string } | null;
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    accountId: string | null;
    taxRateId: string | null;
    account: { code: string; name: string } | null;
  }[];
}

// Same wording as the requisitions list
const statusLabels: Record<string, string> = {
  draft: "Draft",
  submitted: "Waiting for approval",
  approved: "Approved",
  converted: "Ordered",
  rejected: "Rejected",
};

const statusColors: Record<string, string> = {
  draft: "",
  submitted:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  approved:
    "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300",
  rejected:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
  converted:
    "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300",
};

export default function RequisitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const url = `/api/v1/purchase-requisitions/${id}`;
  const { data, loading, refetch } = useApi<RequisitionDetail>(url);
  const req = data?.id ? data : null;
  const [rejectSheetOpen, setRejectSheetOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  useDocumentTitle("Purchases · Requisition Details");
  useEntityTitle(req?.requisitionNumber);
  const editable = useMemo<EditableRequisition | null>(() => (data?.id ? data : null), [data]);

  /** Run a status change, report the server's own error, then reload the requisition. */
  async function act(path: string, success: string, body?: unknown) {
    setActing(true);
    try {
      await postJson(`${url}/${path}`, body);
      toast.success(success);
      await refetch();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      return false;
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    if (await act("reject", "Requisition rejected", { reason: rejectReason || undefined })) {
      setRejectSheetOpen(false);
      setRejectReason("");
    }
  }

  async function handleConvert(contactId?: string) {
    // Ordering needs a supplier: ask for one first if the request doesn't have it
    if (!contactId && !req?.contactId) {
      setSupplierId("");
      setSupplierOpen(true);
      return;
    }
    setActing(true);
    try {
      const data = await postJson<{ purchaseOrder: { id: string } }>(`${url}/convert`, contactId ? { contactId } : undefined);
      toast.success("Purchase order created from this request");
      router.push(`/purchases/orders/${data.purchaseOrder.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create a purchase order");
    } finally {
      setActing(false);
    }
  }

  if (loading)
    return (
      <div className="space-y-6">
        <PageHeader title="Loading..." />
      </div>
    );
  if (!req)
    return (
      <div className="space-y-6">
        <PageHeader title="Requisition not found" />
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title={req.requisitionNumber}
        description={`Supplier: ${req.contact?.name || "Not assigned"}`}
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/purchases/requisitions">
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Link>
        </Button>
        {(req.status === "draft" || req.status === "rejected") && (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={acting}>
              <Pencil className="mr-2 size-4" />
              Edit
            </Button>
            <Button
              size="sm"
              onClick={() => act("submit", "Requisition submitted for approval")}
              disabled={acting}
              className="bg-brand-600 hover:bg-brand-700"
            >
              <Send className="mr-2 size-4" />
              {req.status === "rejected" ? "Resubmit" : "Submit"}
            </Button>
          </>
        )}
        {req.status === "submitted" && (
          <>
            <Button
              size="sm"
              onClick={() => act("approve", "Requisition approved")}
              disabled={acting}
              className="bg-brand-600 hover:bg-brand-700"
            >
              <Check className="mr-2 size-4" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRejectSheetOpen(true)}
              disabled={acting}
              className="text-red-600"
            >
              <X className="mr-2 size-4" />
              Reject
            </Button>
          </>
        )}
        {req.status === "approved" && (
          <Button
            size="sm"
            onClick={() => handleConvert()}
            disabled={acting}
            className="bg-brand-600 hover:bg-brand-700"
          >
            <FileText className="mr-2 size-4" />
            Create a purchase order
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge
          variant="outline"
          className={statusColors[req.status] || ""}
        >
          {statusLabels[req.status] ?? req.status}
        </Badge>
        <span className="text-xs sm:text-sm text-muted-foreground">
          Requested {req.requestDate}
          {req.requiredDate ? ` · Required by ${req.requiredDate}` : ""}
        </span>
      </div>

      {/* Rejection reason */}
      {req.status === "rejected" && req.rejectionReason && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <AlertCircle className="size-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              Rejection Reason
            </p>
            <p className="text-sm text-red-700 dark:text-red-400 mt-1">
              {req.rejectionReason}
            </p>
          </div>
        </div>
      )}

      {/* Converted PO link */}
      {req.status === "converted" && req.convertedPoId && (
        <div className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-900 dark:bg-purple-950/30">
          <FileText className="size-5 text-purple-600 dark:text-purple-400" />
          <p className="text-sm text-purple-800 dark:text-purple-300">
            Converted to purchase order.
          </p>
          <Button variant="link" size="sm" asChild className="text-purple-700 dark:text-purple-300">
            <Link href={`/purchases/orders/${req.convertedPoId}`}>
              View PO
            </Link>
          </Button>
        </div>
      )}

      {/* Reference and notes */}
      {(req.reference || req.notes) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {req.reference && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Reference</p>
              <p className="text-sm">{req.reference}</p>
            </div>
          )}
          {req.notes && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="text-sm">{req.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Total */}
      <div className="rounded-lg border p-4">
        <p className="text-xl font-bold font-mono">
          {formatMoney(req.total, req.currencyCode)}
        </p>
        {req.taxTotal > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {formatMoney(req.subtotal, req.currencyCode)} before tax · {formatMoney(req.taxTotal, req.currencyCode)} tax
          </p>
        )}
      </div>

      {/* Line items */}
      <div className="rounded-lg border overflow-x-auto">
        <div className="grid min-w-[500px] grid-cols-[1fr_80px_100px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Price</span>
          <span className="text-right">Amount</span>
        </div>
        {req.lines.map((line) => (
          <div
            key={line.id}
            className="grid min-w-[500px] grid-cols-[1fr_80px_100px_120px] gap-2 border-b px-4 py-2 last:border-b-0"
          >
            <div>
              <p className="text-sm">{line.description}</p>
              {line.account && (
                <p className="text-xs text-muted-foreground">
                  {line.account.code} &middot; {line.account.name}
                </p>
              )}
            </div>
            <span className="text-right text-sm font-mono">
              {(line.quantity / 100).toFixed(0)}
            </span>
            <span className="text-right text-sm font-mono">
              {formatMoney(line.unitPrice, req.currencyCode)}
            </span>
            <span className="text-right text-sm font-mono font-medium">
              {formatMoney(line.amount, req.currencyCode)}
            </span>
          </div>
        ))}
      </div>

      {/* Reject drawer */}
      <Sheet open={rejectSheetOpen} onOpenChange={setRejectSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Reject Requisition</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Provide a reason for rejection..."
                rows={3}
              />
            </div>
            <Button
              onClick={handleReject}
              disabled={acting}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              <X className="mr-2 size-4" />
              Reject Requisition
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit a draft or rejected request */}
      <RequisitionSheet open={editOpen} onOpenChange={setEditOpen} requisition={editable} onSaved={() => refetch()} />

      {/* Ask for the supplier before ordering */}
      <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Who are you ordering from?</DialogTitle>
            <DialogDescription>A purchase order needs a supplier. Choose one and dubbl creates the order for them.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Supplier</Label>
            <ContactPicker value={supplierId} onChange={setSupplierId} type="supplier" placeholder="Select supplier..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => handleConvert(supplierId)}
              disabled={acting || !supplierId}
              className="bg-brand-600 hover:bg-brand-700"
            >
              <FileText className="mr-2 size-4" />
              Create a purchase order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

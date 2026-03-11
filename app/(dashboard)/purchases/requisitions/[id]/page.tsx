"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  Check,
  X,
  FileText,
  AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/money";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
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
  contact: { name: string } | null;
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    account: { code: string; name: string } | null;
  }[];
}

const statusColors: Record<string, string> = {
  draft: "",
  submitted:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  approved:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
  converted:
    "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300",
};

export default function RequisitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [req, setReq] = useState<RequisitionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectSheetOpen, setRejectSheetOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing] = useState(false);
  useEntityTitle(req?.requisitionNumber);
  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/purchase-requisitions/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.id) setReq(data);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  async function handleSubmit() {
    if (!orgId || !req) return;
    setActing(true);
    try {
      const res = await fetch(`/api/v1/purchase-requisitions/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({}),
      });
      // Use a separate submit-like approach: update status to submitted
      const submitRes = await fetch(`/api/v1/purchase-requisitions/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ status: "submitted" }),
      });
      if (submitRes.ok) {
        const data = await submitRes.json();
        setReq((prev) => (prev ? { ...prev, ...data, status: data.status || "submitted" } : prev));
        toast.success("Requisition submitted for approval");
      } else {
        toast.error("Failed to submit");
      }
    } catch {
      toast.error("Failed to submit");
    } finally {
      setActing(false);
    }
  }

  async function handleApprove() {
    if (!orgId) return;
    setActing(true);
    try {
      const res = await fetch(
        `/api/v1/purchase-requisitions/${id}/approve`,
        {
          method: "POST",
          headers: { "x-organization-id": orgId },
        }
      );
      if (res.ok) {
        const data = await res.json();
        setReq((prev) =>
          prev ? { ...prev, ...data, status: "approved" } : prev
        );
        toast.success("Requisition approved");
      } else {
        toast.error("Failed to approve");
      }
    } catch {
      toast.error("Failed to approve");
    } finally {
      setActing(false);
    }
  }

  async function handleReject() {
    if (!orgId) return;
    setActing(true);
    try {
      const res = await fetch(
        `/api/v1/purchase-requisitions/${id}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": orgId,
          },
          body: JSON.stringify({ reason: rejectReason || undefined }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setReq((prev) =>
          prev
            ? {
                ...prev,
                ...data,
                status: "rejected",
                rejectionReason: rejectReason || null,
              }
            : prev
        );
        setRejectSheetOpen(false);
        setRejectReason("");
        toast.success("Requisition rejected");
      } else {
        toast.error("Failed to reject");
      }
    } catch {
      toast.error("Failed to reject");
    } finally {
      setActing(false);
    }
  }

  async function handleConvert() {
    if (!orgId) return;
    setActing(true);
    try {
      const res = await fetch(
        `/api/v1/purchase-requisitions/${id}/convert`,
        {
          method: "POST",
          headers: { "x-organization-id": orgId },
        }
      );
      if (res.ok) {
        const data = await res.json();
        toast.success("Converted to purchase order");
        router.push(`/purchases/orders/${data.purchaseOrder.id}`);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to convert");
      }
    } catch {
      toast.error("Failed to convert");
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
        {req.status === "draft" && (
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={acting}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Send className="mr-2 size-4" />
            Submit
          </Button>
        )}
        {req.status === "submitted" && (
          <>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={acting}
              className="bg-emerald-600 hover:bg-emerald-700"
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
            onClick={handleConvert}
            disabled={acting}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <FileText className="mr-2 size-4" />
            Convert to PO
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge
          variant="outline"
          className={statusColors[req.status] || ""}
        >
          {req.status}
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
          {formatMoney(req.total)}
        </p>
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
              {formatMoney(line.unitPrice)}
            </span>
            <span className="text-right text-sm font-mono font-medium">
              {formatMoney(line.amount)}
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
    </div>
  );
}

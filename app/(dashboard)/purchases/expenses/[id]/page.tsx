"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  Check,
  X,
  DollarSign,
  Trash2,
  FileText,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/money";
import Link from "next/link";

interface ExpenseDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  totalAmount: number;
  currencyCode: string;
  rejectionReason: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  paidAt: string | null;
  submittedByUser: { name: string | null; email: string } | null;
  approvedByUser: { name: string | null; email: string } | null;
  items: {
    id: string;
    date: string;
    description: string;
    amount: number;
    category: string | null;
    receiptFileKey: string | null;
    receiptFileName: string | null;
    account: { code: string; name: string } | null;
  }[];
}

const statusColors: Record<string, string> = {
  draft: "",
  submitted: "border-blue-200 bg-blue-50 text-blue-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  paid: "border-purple-200 bg-purple-50 text-purple-700",
};

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [claim, setClaim] = useState<ExpenseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payDate, setPayDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/expenses/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.expenseClaim) setClaim(data.expenseClaim);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  async function handleSubmit() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/expenses/${id}/submit`, {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      const data = await res.json();
      setClaim((prev) =>
        prev ? { ...prev, ...data.expenseClaim } : prev
      );
      toast.success("Expense claim submitted for approval");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to submit");
    }
  }

  async function handleApprove() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/expenses/${id}/approve`, {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      const data = await res.json();
      setClaim((prev) =>
        prev ? { ...prev, ...data.expenseClaim } : prev
      );
      toast.success("Expense claim approved");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to approve");
    }
  }

  async function handleReject() {
    if (!orgId || !rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    const res = await fetch(`/api/v1/expenses/${id}/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-organization-id": orgId,
      },
      body: JSON.stringify({ reason: rejectReason }),
    });
    if (res.ok) {
      const data = await res.json();
      setClaim((prev) =>
        prev ? { ...prev, ...data.expenseClaim } : prev
      );
      setRejectOpen(false);
      setRejectReason("");
      toast.success("Expense claim rejected");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to reject");
    }
  }

  async function handlePay() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/expenses/${id}/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-organization-id": orgId,
      },
      body: JSON.stringify({ date: payDate }),
    });
    if (res.ok) {
      const data = await res.json();
      setClaim((prev) =>
        prev ? { ...prev, ...data.expenseClaim } : prev
      );
      setPayOpen(false);
      toast.success("Expense claim marked as paid");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to mark as paid");
    }
  }

  async function handleDelete() {
    if (!orgId || !confirm("Delete this expense claim?")) return;
    const res = await fetch(`/api/v1/expenses/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      toast.success("Expense claim deleted");
      router.push("/purchases/expenses");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to delete");
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading..." />
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="space-y-6">
        <PageHeader title="Expense claim not found" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={claim.title}
        description={`By: ${claim.submittedByUser?.name || claim.submittedByUser?.email || "Unknown"}`}
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/purchases/expenses">
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Link>
        </Button>

        {claim.status === "draft" && (
          <>
            <Button
              size="sm"
              onClick={handleSubmit}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Send className="mr-2 size-4" />
              Submit for Approval
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="text-red-600"
            >
              <Trash2 className="mr-2 size-4" />
              Delete
            </Button>
          </>
        )}

        {claim.status === "submitted" && (
          <>
            <Button
              size="sm"
              onClick={handleApprove}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Check className="mr-2 size-4" />
              Approve
            </Button>
            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-red-600">
                  <X className="mr-2 size-4" />
                  Reject
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reject Expense Claim</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Reason *</Label>
                    <Textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      placeholder="Explain why this expense claim is being rejected..."
                    />
                  </div>
                  <Button
                    onClick={handleReject}
                    className="w-full bg-red-600 hover:bg-red-700"
                  >
                    Reject Expense Claim
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        {claim.status === "approved" && (
          <Dialog open={payOpen} onOpenChange={setPayOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <DollarSign className="mr-2 size-4" />
                Mark as Paid
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Mark as Paid</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/50 px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    Total Amount
                  </p>
                  <p className="text-xl font-bold font-mono">
                    {formatMoney(claim.totalAmount, claim.currencyCode)}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Payment Date</Label>
                  <Input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handlePay}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  Confirm Payment
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      <div className="flex items-center gap-3">
        <Badge
          variant="outline"
          className={statusColors[claim.status] || ""}
        >
          {claim.status}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Created {new Date(claim.createdAt).toLocaleDateString()}
          {claim.submittedAt &&
            ` · Submitted ${new Date(claim.submittedAt).toLocaleDateString()}`}
          {claim.approvedAt &&
            ` · Approved ${new Date(claim.approvedAt).toLocaleDateString()}`}
          {claim.paidAt &&
            ` · Paid ${new Date(claim.paidAt).toLocaleDateString()}`}
        </span>
      </div>

      {claim.description && (
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground mb-1">Description</p>
          <p className="text-sm">{claim.description}</p>
        </div>
      )}

      {claim.status === "rejected" && claim.rejectionReason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium text-red-700 mb-1">
            Rejection Reason
          </p>
          <p className="text-sm text-red-600">{claim.rejectionReason}</p>
        </div>
      )}

      {claim.approvedByUser && (
        <div className="text-sm text-muted-foreground">
          Approved by:{" "}
          {claim.approvedByUser.name || claim.approvedByUser.email}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total Amount</p>
          <p className="text-xl font-bold font-mono">
            {formatMoney(claim.totalAmount, claim.currencyCode)}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Items</p>
          <p className="text-xl font-bold font-mono">
            {claim.items.length}
          </p>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[100px_1fr_120px_120px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Date</span>
          <span>Description</span>
          <span>Category</span>
          <span>Receipt</span>
          <span className="text-right">Amount</span>
        </div>
        {claim.items.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[100px_1fr_120px_120px_120px] gap-2 border-b px-4 py-2 last:border-b-0"
          >
            <span className="text-sm">{item.date}</span>
            <div>
              <p className="text-sm">{item.description}</p>
              {item.account && (
                <p className="text-xs text-muted-foreground">
                  {item.account.code} &middot; {item.account.name}
                </p>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {item.category || "-"}
            </span>
            <span className="text-sm">
              {item.receiptFileName ? (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <FileText className="size-3" />
                  <span className="max-w-[80px] truncate text-xs">
                    {item.receiptFileName}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </span>
            <span className="text-right text-sm font-mono font-medium">
              {formatMoney(item.amount, claim.currencyCode)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

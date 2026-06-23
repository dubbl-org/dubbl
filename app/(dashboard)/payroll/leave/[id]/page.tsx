"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { cn } from "@/lib/utils";

interface LeaveRequestDetail {
  id: string;
  startDate: string;
  endDate: string;
  hours: number;
  status: string;
  reason: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  employee: { name: string; employeeNumber?: string } | null;
  policy: { name: string; leaveType: string } | null;
}

const statusColors: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
  cancelled: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

export default function LeaveRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [req, setReq] = useState<LeaveRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [approving, setApproving] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
  useDocumentTitle("Payroll · Leave Details");

  const fetchRequest = useCallback(() => {
    if (!orgId) return;
    fetch(`/api/v1/payroll/leave/requests/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => { if (data.request) setReq(data.request); })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  useEffect(() => { fetchRequest(); }, [fetchRequest]);

  async function handleApprove() {
    if (!orgId || approving || !req) return;
    const confirmed = await confirm({
      title: "Approve this leave request?",
      description: `${req.employee?.name || "Employee"} will be granted ${req.hours}h of ${req.policy?.name || "leave"}. Their leave balance will be reduced.`,
      confirmLabel: "Approve",
    });
    if (!confirmed) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/v1/payroll/leave/requests/${id}/approve`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (res.ok) {
        toast.success("Leave request approved");
        fetchRequest();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Failed to approve");
      }
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!orgId || rejecting) return;
    setRejecting(true);
    try {
      const res = await fetch(`/api/v1/payroll/leave/requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ reason: rejectReason.trim() || undefined }),
      });
      if (res.ok) {
        toast.success("Leave request rejected");
        setRejectOpen(false);
        setRejectReason("");
        fetchRequest();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Failed to reject");
      }
    } finally {
      setRejecting(false);
    }
  }

  if (loading) return <BrandLoader />;

  if (!req) {
    return (
      <ContentReveal>
        <button onClick={() => router.push("/payroll/leave")} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="size-3.5" /> Back to leave
        </button>
        <p className="text-sm text-muted-foreground">Leave request not found</p>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      <button onClick={() => router.push("/payroll/leave")} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to leave
      </button>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
            <CalendarDays className="size-5 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{req.employee?.name || "Unknown"}</h1>
              <Badge variant="outline" className={cn("text-[10px]", statusColors[req.status] || "")}>{req.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {req.policy?.name || "-"} · {req.startDate} to {req.endDate} · {req.hours}h
            </p>
          </div>
        </div>
        {req.status === "pending" && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleApprove} disabled={approving} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle className="mr-1.5 size-3.5" /> Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)} disabled={approving}>
              <XCircle className="mr-1.5 size-3.5" /> Reject
            </Button>
          </div>
        )}
      </div>

      {req.reason && (
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Reason for request</p>
          <p className="text-sm">{req.reason}</p>
        </div>
      )}

      {req.status === "rejected" && req.rejectionReason && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20 px-4 py-3">
          <p className="text-sm text-red-600 dark:text-red-400">Rejected: {req.rejectionReason}</p>
        </div>
      )}

      {/* Details */}
      <div className="rounded-xl border bg-card divide-y">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-muted-foreground">Leave type</span>
          <span className="text-sm font-medium">{req.policy?.name || "-"}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-muted-foreground">Dates</span>
          <span className="text-sm font-medium">{req.startDate} to {req.endDate}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-muted-foreground">Hours</span>
          <span className="text-sm font-mono tabular-nums">{req.hours}h</span>
        </div>
        {req.status === "approved" && req.approvedAt && (
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-muted-foreground">Approved on</span>
            <span className="text-sm font-medium">{new Date(req.approvedAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      <Dialog open={rejectOpen} onOpenChange={(open) => { if (!rejecting) { setRejectOpen(open); if (!open) setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject leave request</DialogTitle>
            <DialogDescription>
              Let the employee know why this leave can&apos;t be approved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. This clashes with a busy period — please pick different dates."
              rows={4}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejecting}>
              <XCircle className="mr-1.5 size-3.5" /> Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </ContentReveal>
  );
}

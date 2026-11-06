"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Circle, ShieldCheck, ThumbsUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApi } from "@/lib/query/use-api";
import { cn } from "@/lib/utils";
import type { ApprovalEntityType } from "@/lib/approvals/select";

interface PersonRef {
  user?: { name?: string | null; email?: string | null } | null;
}

interface Step {
  id: string;
  stepOrder: number;
  approverId: string;
  approver?: PersonRef | null;
}

interface Action {
  id: string;
  stepId: string;
  action: "approve" | "reject" | "comment";
  comment: string | null;
  createdAt: string;
  user?: PersonRef | null;
}

/** GET /api/v1/approval-requests/for-entity */
export interface ApprovalStatus {
  entityStatus: string;
  workflow: { id: string; name: string; steps: Step[] } | null;
  request: {
    id: string;
    status: "pending" | "approved" | "rejected" | "cancelled";
    currentStepOrder: number;
    workflow: { id: string; name: string; steps: Step[] };
    requestedBy?: PersonRef | null;
    actions: Action[];
  } | null;
  currentStep: Step | null;
  isCurrentApprover: boolean;
  blocked: boolean;
}

const API_PATH: Record<ApprovalEntityType, string> = {
  bill: "bills",
  expense: "expenses",
  invoice: "invoices",
  journal_entry: "entries",
  purchase_order: "purchase-orders",
};

const NAMES: Record<ApprovalEntityType, string> = {
  bill: "bill",
  expense: "expense claim",
  invoice: "invoice",
  journal_entry: "entry",
  purchase_order: "order",
};

// What the record can do once approved (journal entries / purchase orders).
const NEXT_STEP: Partial<Record<ApprovalEntityType, string>> = {
  journal_entry: "finalize it",
  purchase_order: "send it",
};

function personName(p?: PersonRef | null) {
  return p?.user?.name || p?.user?.email || "Someone";
}

export function approvalStatusUrl(entityType: ApprovalEntityType, entityId: string) {
  return `/api/v1/approval-requests/for-entity?entityType=${entityType}&entityId=${entityId}`;
}

/**
 * Shows where a record stands in its approval workflow: who has approved, whose
 * turn it is, and (in "full" mode, for journal entries and purchase orders)
 * Submit for approval / Approve / Reject. Bills, expenses and invoices use
 * "progress" mode: their own Approve / Reject buttons go through the same
 * workflow. Renders nothing when no workflow applies.
 */
export function ApprovalPanel({
  entityType,
  entityId,
  mode = "full",
}: {
  entityType: ApprovalEntityType;
  entityId: string;
  mode?: "full" | "progress";
}) {
  const { data } = useApi<ApprovalStatus>(approvalStatusUrl(entityType, entityId));
  const [busy, setBusy] = useState<"submit" | "approve" | "reject" | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!data) return null;
  const { workflow, request, isCurrentApprover, entityStatus } = data;
  if (!workflow && !request) return null;

  const name = NAMES[entityType];
  const next = NEXT_STEP[entityType];
  const full = mode === "full";
  const canSubmit =
    full && !!workflow && entityStatus === "draft" && (!request || request.status === "rejected");

  async function act(kind: "submit" | "approve" | "reject") {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setBusy(kind);
    try {
      const path = kind === "submit" ? "submit-for-approval" : kind;
      const res = await fetch(`/api/v1/${API_PATH[entityType]}/${entityId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify(kind === "reject" ? { reason: reason.trim() || undefined } : {}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Something went wrong");
      if (kind === "submit") toast.success("Sent for approval");
      if (kind === "approve") {
        toast.success(
          body.approved || body.finalized
            ? next
              ? `Approved. You can now ${next}.`
              : "Approved"
            : "Approved. It's now with the next approver."
        );
      }
      if (kind === "reject") {
        setRejectOpen(false);
        setReason("");
        toast.success("Rejected");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const steps = request?.workflow.steps ?? workflow?.steps ?? [];
  const rejection = request?.status === "rejected" ? request.actions.find((a) => a.action === "reject") : undefined;

  let title: string;
  let detail: string;
  if (!request) {
    title = "Needs approval";
    detail = `The "${workflow!.name}" workflow applies to this ${name}.${
      next ? ` Submit it for approval before you ${next}.` : " Submit it for approval to start it."
    }`;
  } else if (request.status === "pending") {
    const step = steps.find((s) => s.stepOrder === request.currentStepOrder);
    title = isCurrentApprover ? "Waiting for you to approve" : "Waiting for approval";
    detail = `Step ${request.currentStepOrder} of ${steps.length}: ${personName(step?.approver)}. Sent by ${personName(request.requestedBy)}.`;
  } else if (request.status === "approved") {
    title = "Approved";
    detail = next && entityStatus === "draft" ? `Every step has approved. You can now ${next}.` : "Every step has approved.";
  } else {
    title = "Rejected";
    detail = `${personName(rejection?.user)} rejected it${rejection?.comment ? `: "${rejection.comment}"` : "."}${
      canSubmit ? " Fix it if needed and submit it again." : ""
    }`;
  }

  // Hide the panel for finished records once there's nothing left to show.
  if (!full && !request) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
            <ShieldCheck className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{detail}</p>
          </div>
        </div>
        {full && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canSubmit && (
              <Button size="sm" variant="outline" onClick={() => act("submit")} loading={busy === "submit"}>
                <ThumbsUp className="mr-2 size-3.5" />
                Submit for approval
              </Button>
            )}
            {request?.status === "pending" && isCurrentApprover && (
              <>
                <Button
                  size="sm"
                  onClick={() => act("approve")}
                  loading={busy === "approve"}
                  className="bg-brand-600 hover:bg-brand-700"
                >
                  <Check className="mr-2 size-3.5" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => setRejectOpen(true)}
                >
                  <X className="mr-2 size-3.5" />
                  Reject
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {request && steps.length > 0 && (
        <ol className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3">
          {steps.map((s) => {
            const done =
              request.status === "approved" ||
              (request.status !== "cancelled" && s.stepOrder < request.currentStepOrder);
            const current = request.status === "pending" && s.stepOrder === request.currentStepOrder;
            const rejected = request.status === "rejected" && s.stepOrder === request.currentStepOrder;
            return (
              <li key={s.id} className="flex items-center gap-1.5 text-xs">
                {done ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : rejected ? (
                  <X className="size-3.5 text-red-600" />
                ) : (
                  <Circle className={cn("size-3", current ? "text-foreground" : "text-muted-foreground/50")} />
                )}
                <span className={cn(current ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {s.stepOrder}. {personName(s.approver)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <Dialog open={rejectOpen} onOpenChange={(o) => { setRejectOpen(o); if (!o) setReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this {name}?</DialogTitle>
            <DialogDescription>
              It stays a draft so it can be fixed and submitted again. Add a reason so everyone knows why.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong account" />
          </div>
          <Button
            onClick={() => act("reject")}
            loading={busy === "reject"}
            className="w-full bg-red-600 hover:bg-red-700"
          >
            Reject {name}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Approval workflows applied to real records. One implementation of submit /
 * approve / reject per record type, shared by the REST routes, the generic
 * approval-request action route and the MCP tools so every path enforces the
 * same rules:
 *
 *   invoice         draft -> pending_approval (workflow required); final
 *                   approval returns it to draft, ready to send; reject ->
 *                   rejected.
 *   bill            draft -> pending_approval. With a matching workflow an
 *                   approval request is opened and the bill posts to the
 *                   ledger only when the last step approves; without one, any
 *                   holder of approve:bills approves and posts it directly.
 *   expense         draft/rejected -> submitted, same rule as bills (the
 *                   approval journal posts when the claim is fully approved).
 *   journal_entry   no approval status: when an active workflow matches, the
 *   purchase_order  draft needs an approved request before it can be posted
 *                   (entry) or sent (order). See assertApprovedIfRequired.
 *
 * All amounts are integer cents.
 */
import { db } from "@/lib/db";
import {
  approvalRequest,
  approvalWorkflow,
  approvalWorkflowStep,
  approvalAction,
  bill,
  expenseClaim,
  invoice,
  journalEntry,
  journalLine,
  purchaseOrder,
} from "@/lib/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import type { AuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { assertNotLocked } from "@/lib/api/period-lock";
import {
  createBillJournalEntry,
  mapBillLinesForPosting,
  recordBillStockReceipts,
  assertBaseRateAvailable,
} from "@/lib/api/journal-automation";
import { createExpenseClaimApprovalJournalEntry } from "@/lib/api/expense-claims";
import { postBillReceipt } from "@/app/api/v1/bills/_procurement";
import { ApprovalError } from "./errors";
import {
  checkApprovalRequired,
  createApprovalRequest,
  cancelApprovalRequests,
  findLatestApprovalRequest,
  findPendingApprovalRequest,
  processApprovalAction,
  resolveApprovalMember,
} from "./engine";
import type { ApprovalEntityType } from "./select";

/** Plain-language name of each record type, for messages. */
export const APPROVAL_ENTITY_NAMES: Record<ApprovalEntityType, string> = {
  bill: "bill",
  expense: "expense claim",
  invoice: "invoice",
  journal_entry: "journal entry",
  purchase_order: "purchase order",
};

/** Permission needed to send a record for approval. */
const SUBMIT_PERMISSION: Record<ApprovalEntityType, string> = {
  bill: "manage:bills",
  expense: "manage:expenses",
  invoice: "manage:invoices",
  journal_entry: "edit:entries",
  purchase_order: "manage:bills",
};

/**
 * Permission needed to approve or reject. Journal entries and purchase orders
 * have no approve permission of their own: the workflow names the approver of
 * each step and only that member can act.
 */
const APPROVE_PERMISSION: Partial<Record<ApprovalEntityType, string>> = {
  bill: "approve:bills",
  expense: "approve:expenses",
  invoice: "approve:invoices",
};

/** Statuses a record must be in to be submitted / acted on. */
const SUBMITTABLE: Record<ApprovalEntityType, string[]> = {
  bill: ["draft"],
  expense: ["draft", "rejected"],
  invoice: ["draft"],
  journal_entry: ["draft"],
  purchase_order: ["draft"],
};

const AWAITING: Record<ApprovalEntityType, string> = {
  bill: "pending_approval",
  expense: "submitted",
  invoice: "pending_approval",
  journal_entry: "draft",
  purchase_order: "draft",
};

/** Whether a record type can only be approved through a workflow request. */
const WORKFLOW_ONLY: Record<ApprovalEntityType, boolean> = {
  bill: false,
  expense: false,
  invoice: true,
  journal_entry: true,
  purchase_order: true,
};

export interface ApprovalOutcome {
  entityType: ApprovalEntityType;
  /** The record after the action (status may be unchanged mid-workflow). */
  entity: Record<string, unknown>;
  /** The approval request after the action; null when no workflow applied. */
  request: typeof approvalRequest.$inferSelect | null;
  /** True once the record is fully approved (or rejected) and its status moved. */
  finalized: boolean;
  /** Bill posting extras (goods-received clearing entry, tolerance warnings). */
  grniEntryId?: string | null;
  warnings?: unknown[];
}

/* ------------------------------------------------------------------ */
/*  Loading                                                            */
/* ------------------------------------------------------------------ */

/**
 * Load an org-scoped record plus the fields workflow conditions are evaluated
 * against (journal entries get a computed `total`: the sum of their debits).
 */
export async function loadApprovalEntity(
  orgId: string,
  entityType: ApprovalEntityType,
  entityId: string
): Promise<Record<string, unknown> & { status: string }> {
  let found: (Record<string, unknown> & { status: string }) | undefined;
  switch (entityType) {
    case "invoice":
      found = await db.query.invoice.findFirst({
        where: and(eq(invoice.id, entityId), eq(invoice.organizationId, orgId), notDeleted(invoice.deletedAt)),
      });
      break;
    case "bill":
      found = await db.query.bill.findFirst({
        where: and(eq(bill.id, entityId), eq(bill.organizationId, orgId), notDeleted(bill.deletedAt)),
      });
      break;
    case "expense":
      found = await db.query.expenseClaim.findFirst({
        where: and(eq(expenseClaim.id, entityId), eq(expenseClaim.organizationId, orgId), notDeleted(expenseClaim.deletedAt)),
      });
      break;
    case "purchase_order":
      found = await db.query.purchaseOrder.findFirst({
        where: and(eq(purchaseOrder.id, entityId), eq(purchaseOrder.organizationId, orgId), notDeleted(purchaseOrder.deletedAt)),
      });
      break;
    case "journal_entry": {
      const entry = await db.query.journalEntry.findFirst({
        where: and(eq(journalEntry.id, entityId), eq(journalEntry.organizationId, orgId), notDeleted(journalEntry.deletedAt)),
      });
      if (entry) {
        const [sum] = await db
          .select({ total: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`.mapWith(Number) })
          .from(journalLine)
          .where(eq(journalLine.journalEntryId, entityId));
        found = { ...entry, total: sum?.total ?? 0 };
      }
      break;
    }
  }
  if (!found) {
    const name = APPROVAL_ENTITY_NAMES[entityType];
    throw new ApprovalError(`${name.charAt(0).toUpperCase()}${name.slice(1)} not found`, 404);
  }
  return found;
}

async function isFinalStep(request: typeof approvalRequest.$inferSelect) {
  const steps = await db.query.approvalWorkflowStep.findMany({
    where: eq(approvalWorkflowStep.workflowId, request.workflowId),
    columns: { stepOrder: true },
  });
  const maxStep = Math.max(0, ...steps.map((s) => s.stepOrder));
  return request.currentStepOrder >= maxStep;
}

/* ------------------------------------------------------------------ */
/*  Submit                                                             */
/* ------------------------------------------------------------------ */

/**
 * Open an approval request for a record when an active workflow matches it.
 * Replaces any request still pending for the record. Returns null when no
 * workflow applies (the caller decides whether that's allowed).
 */
export async function openApprovalRequest(
  ctx: AuthContext,
  entityType: ApprovalEntityType,
  entityId: string,
  record: Record<string, unknown>
) {
  const workflow = await checkApprovalRequired(ctx.organizationId, entityType, record);
  if (!workflow) return null;
  const requester = await resolveApprovalMember(ctx);
  await cancelApprovalRequests(ctx.organizationId, entityType, entityId, ["pending"]);
  return createApprovalRequest(ctx.organizationId, workflow.id, entityType, entityId, requester.id);
}

/** Send a record into its approval workflow. */
export async function submitForApproval(
  ctx: AuthContext,
  entityType: ApprovalEntityType,
  entityId: string
): Promise<ApprovalOutcome> {
  requireRole(ctx, SUBMIT_PERMISSION[entityType]);
  const name = APPROVAL_ENTITY_NAMES[entityType];
  const found = await loadApprovalEntity(ctx.organizationId, entityType, entityId);

  if (!SUBMITTABLE[entityType].includes(found.status)) {
    throw new ApprovalError(
      entityType === "expense"
        ? "Only draft or rejected expense claims can be submitted"
        : `Only draft ${name}s can be submitted for approval`,
      400
    );
  }

  if (entityType === "journal_entry" || entityType === "purchase_order") {
    const latest = await findLatestApprovalRequest(ctx.organizationId, entityType, entityId);
    if (latest?.status === "pending") {
      throw new ApprovalError(`This ${name} is already waiting for approval`, 409);
    }
    if (latest?.status === "approved") {
      throw new ApprovalError(`This ${name} is already approved`, 409);
    }
  }

  const request = await openApprovalRequest(ctx, entityType, entityId, found);
  if (!request && WORKFLOW_ONLY[entityType]) {
    throw new ApprovalError(`No active approval workflow applies to this ${name}`, 400);
  }

  const now = new Date();
  let entity: Record<string, unknown> = found;
  if (entityType === "invoice") {
    [entity] = await db
      .update(invoice)
      .set({ status: "pending_approval", updatedAt: now })
      .where(eq(invoice.id, entityId))
      .returning();
  } else if (entityType === "bill") {
    [entity] = await db
      .update(bill)
      .set({ status: "pending_approval", updatedAt: now })
      .where(eq(bill.id, entityId))
      .returning();
  } else if (entityType === "expense") {
    // A corrected rejected claim goes back to the queue clean.
    [entity] = await db
      .update(expenseClaim)
      .set({ status: "submitted", submittedAt: now, rejectedAt: null, rejectionReason: null, updatedAt: now })
      .where(eq(expenseClaim.id, entityId))
      .returning();
  }

  return { entityType, entity, request, finalized: false };
}

/* ------------------------------------------------------------------ */
/*  Approve                                                            */
/* ------------------------------------------------------------------ */

/** Pre-flight checks so a final approval is never recorded on something that can't post. */
async function assertCanFinalize(
  ctx: AuthContext,
  entityType: ApprovalEntityType,
  found: Record<string, unknown>
) {
  if (entityType === "bill") {
    await assertNotLocked(ctx.organizationId, found.issueDate as string, ctx);
    await assertBaseRateAvailable(ctx.organizationId, found.currencyCode as string, found.issueDate as string);
  } else if (entityType === "expense") {
    // The approval entry is dated today.
    await assertNotLocked(ctx.organizationId, new Date().toISOString().slice(0, 10), ctx);
  }
}

/** Apply the fully-approved state to the record (posting bills and expense claims). */
async function finalizeApproved(
  ctx: AuthContext,
  entityType: ApprovalEntityType,
  entityId: string,
  found: Record<string, unknown>
): Promise<Pick<ApprovalOutcome, "entity" | "grniEntryId" | "warnings">> {
  const now = new Date();
  switch (entityType) {
    case "invoice": {
      // Approved invoices return to draft, ready to send.
      const [row] = await db
        .update(invoice)
        .set({ status: "draft", updatedAt: now })
        .where(eq(invoice.id, entityId))
        .returning();
      return { entity: row };
    }
    case "bill": {
      const full = await db.query.bill.findFirst({ where: eq(bill.id, entityId), with: { lines: true } });
      if (!full) throw new ApprovalError("Bill not found", 404);
      // Post the bill: main entry (unmatched lines + full tax -> AP) plus, for
      // lines linked to a goods receipt / PO line, the GRNI clearing and price
      // variance entry. A three-way-match violation throws ProcurementBlockedError.
      const { entryId, grniEntryId, warnings } = await postBillReceipt(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        {
          id: full.id,
          billNumber: full.billNumber,
          issueDate: full.issueDate,
          currencyCode: full.currencyCode,
          taxTotal: full.taxTotal,
          total: full.total,
          lines: full.lines.map((l) => ({
            id: l.id,
            description: l.description,
            amount: l.amount,
            quantity: l.quantity,
            accountId: l.accountId,
            inventoryItemId: l.inventoryItemId,
            warehouseId: l.warehouseId,
            goodsReceiptLineId: l.goodsReceiptLineId,
            taxRateId: l.taxRateId,
            taxAmount: l.taxAmount,
          })),
        },
        { createBillJournalEntry, mapBillLinesForPosting, recordBillStockReceipts }
      );
      const [row] = await db
        .update(bill)
        .set({
          status: "received",
          approvedBy: ctx.userId,
          approvedAt: now,
          receivedAt: now,
          journalEntryId: entryId || null,
          updatedAt: now,
        })
        .where(eq(bill.id, entityId))
        .returning();
      return { entity: row, grniEntryId, warnings };
    }
    case "expense": {
      const claim = await db.query.expenseClaim.findFirst({
        where: eq(expenseClaim.id, entityId),
        with: { items: { with: { account: true } } },
      });
      if (!claim) throw new ApprovalError("Expense claim not found", 404);
      const date = now.toISOString().slice(0, 10);
      // Post the approval entry (DR expense accounts / CR Employee
      // Reimbursements Payable) and flip status to approved atomically.
      const row = await db.transaction(async (tx) => {
        const entry = await createExpenseClaimApprovalJournalEntry(ctx, claim, tx, date);
        const [updated] = await tx
          .update(expenseClaim)
          .set({ status: "approved", approvedBy: ctx.userId, approvedAt: now, journalEntryId: entry.id, updatedAt: now })
          .where(eq(expenseClaim.id, entityId))
          .returning();
        return updated;
      });
      return { entity: row };
    }
    default:
      // Journal entries and purchase orders keep their draft status: the
      // approved request is what lets them be posted / sent.
      return { entity: found };
  }
}

/**
 * Approve a record. With an open workflow request only the current step's
 * approver can act; the record moves on (and posts) only after the last step.
 */
export async function approveEntity(
  ctx: AuthContext,
  entityType: ApprovalEntityType,
  entityId: string,
  comment?: string
): Promise<ApprovalOutcome> {
  const permission = APPROVE_PERMISSION[entityType];
  if (permission) requireRole(ctx, permission);
  const name = APPROVAL_ENTITY_NAMES[entityType];
  const found = await loadApprovalEntity(ctx.organizationId, entityType, entityId);

  if (found.status !== AWAITING[entityType]) {
    throw new ApprovalError(
      entityType === "expense"
        ? "Only submitted expense claims can be approved"
        : WORKFLOW_ONLY[entityType] && entityType !== "invoice"
          ? `Only draft ${name}s can be approved`
          : `Only ${name}s pending approval can be approved`,
      400
    );
  }

  const pending = await findPendingApprovalRequest(ctx.organizationId, entityType, entityId);
  if (!pending) {
    if (WORKFLOW_ONLY[entityType]) {
      throw new ApprovalError(`This ${name} isn't waiting for approval. Submit it for approval first.`, 400);
    }
    // No workflow applies: simple one-click approval.
    await assertCanFinalize(ctx, entityType, found);
    const done = await finalizeApproved(ctx, entityType, entityId, found);
    return { entityType, request: null, finalized: true, ...done };
  }

  const approver = await resolveApprovalMember(ctx);
  if (await isFinalStep(pending)) {
    await assertCanFinalize(ctx, entityType, found);
  }
  const request = await processApprovalAction(pending.id, approver.id, "approve", comment, ctx.organizationId);

  if (request.status !== "approved") {
    return { entityType, entity: found, request, finalized: false };
  }
  const done = await finalizeApproved(ctx, entityType, entityId, found);
  return { entityType, request, finalized: true, ...done };
}

/**
 * Post a draft bill straight to the ledger without a workflow (the "Add to my
 * books" path, requires approve:bills). Used by the MCP approve_bill tool for
 * draft bills.
 */
export async function postDraftBill(ctx: AuthContext, billId: string): Promise<ApprovalOutcome> {
  requireRole(ctx, "approve:bills");
  const found = await loadApprovalEntity(ctx.organizationId, "bill", billId);
  if (found.status !== "draft") {
    throw new ApprovalError("Only draft bills can be added to the books directly", 400);
  }
  await assertCanFinalize(ctx, "bill", found);
  const done = await finalizeApproved(ctx, "bill", billId, found);
  return { entityType: "bill", request: null, finalized: true, ...done };
}

/* ------------------------------------------------------------------ */
/*  Reject                                                             */
/* ------------------------------------------------------------------ */

/** Reject a record. A rejection at any step rejects the whole request. */
export async function rejectEntity(
  ctx: AuthContext,
  entityType: ApprovalEntityType,
  entityId: string,
  reason?: string
): Promise<ApprovalOutcome> {
  const permission = APPROVE_PERMISSION[entityType];
  if (permission) requireRole(ctx, permission);
  const name = APPROVAL_ENTITY_NAMES[entityType];
  const found = await loadApprovalEntity(ctx.organizationId, entityType, entityId);

  if (found.status !== AWAITING[entityType]) {
    throw new ApprovalError(
      entityType === "expense"
        ? "Only submitted expense claims can be rejected"
        : WORKFLOW_ONLY[entityType] && entityType !== "invoice"
          ? `Only draft ${name}s can be rejected`
          : `Only ${name}s pending approval can be rejected`,
      400
    );
  }
  if (entityType === "expense" && !reason?.trim()) {
    throw new ApprovalError("Rejection reason is required", 400);
  }

  const pending = await findPendingApprovalRequest(ctx.organizationId, entityType, entityId);
  let request: ApprovalOutcome["request"] = null;
  if (pending) {
    const approver = await resolveApprovalMember(ctx);
    request = await processApprovalAction(pending.id, approver.id, "reject", reason, ctx.organizationId);
  } else if (WORKFLOW_ONLY[entityType]) {
    throw new ApprovalError(`This ${name} isn't waiting for approval`, 400);
  }

  const now = new Date();
  let entity: Record<string, unknown> = found;
  if (entityType === "invoice") {
    [entity] = await db.update(invoice).set({ status: "rejected", updatedAt: now }).where(eq(invoice.id, entityId)).returning();
  } else if (entityType === "bill") {
    // Back to draft so it can be fixed and re-submitted.
    [entity] = await db
      .update(bill)
      .set({ status: "draft", rejectedAt: now, rejectionReason: reason || null, updatedAt: now })
      .where(eq(bill.id, entityId))
      .returning();
  } else if (entityType === "expense") {
    [entity] = await db
      .update(expenseClaim)
      .set({ status: "rejected", rejectionReason: reason ?? null, rejectedAt: now, updatedAt: now })
      .where(eq(expenseClaim.id, entityId))
      .returning();
  }

  return { entityType, entity, request, finalized: true };
}

/* ------------------------------------------------------------------ */
/*  Gate for records without an approval status                        */
/* ------------------------------------------------------------------ */

/**
 * Journal entries and purchase orders: when an active workflow matches the
 * draft, it can only be posted / sent once an approval request for it has been
 * fully approved. No matching workflow means no gate.
 */
export async function assertApprovedIfRequired(
  ctx: AuthContext,
  entityType: "journal_entry" | "purchase_order",
  entityId: string
) {
  const found = await loadApprovalEntity(ctx.organizationId, entityType, entityId);
  const workflow = await checkApprovalRequired(ctx.organizationId, entityType, found);
  if (!workflow) return;

  const latest = await findLatestApprovalRequest(ctx.organizationId, entityType, entityId);
  if (latest?.status === "approved") return;

  const name = APPROVAL_ENTITY_NAMES[entityType];
  const verb = entityType === "journal_entry" ? "posted" : "sent";
  if (latest?.status === "pending") {
    throw new ApprovalError(`This ${name} is waiting for approval. It can be ${verb} once every approver has approved it.`, 409);
  }
  if (latest?.status === "rejected") {
    throw new ApprovalError(`This ${name} was rejected. Fix it if needed and submit it for approval again before it can be ${verb}.`, 409);
  }
  throw new ApprovalError(`This ${name} needs approval before it can be ${verb}. Submit it for approval first.`, 409);
}

/* ------------------------------------------------------------------ */
/*  Status for the UI / agents                                         */
/* ------------------------------------------------------------------ */

/**
 * Where a record stands in its approval workflow: the matching workflow (or
 * the one its latest request used), that request with its steps and actions,
 * and whether the caller is the approver of the current step.
 */
export async function getApprovalStatus(
  ctx: AuthContext,
  entityType: ApprovalEntityType,
  entityId: string
) {
  const found = await loadApprovalEntity(ctx.organizationId, entityType, entityId);
  const latest = await findLatestApprovalRequest(ctx.organizationId, entityType, entityId);
  const matching = await checkApprovalRequired(ctx.organizationId, entityType, found);
  const me = await resolveApprovalMember(ctx).catch(() => null);

  const userCols = { columns: { id: true, name: true, email: true, image: true } } as const;
  const request = latest
    ? await db.query.approvalRequest.findFirst({
        where: eq(approvalRequest.id, latest.id),
        with: {
          workflow: {
            with: {
              steps: {
                orderBy: asc(approvalWorkflowStep.stepOrder),
                with: { approver: { with: { user: userCols } } },
              },
            },
          },
          requestedBy: { with: { user: userCols } },
          actions: {
            orderBy: asc(approvalAction.createdAt),
            with: { user: { with: { user: userCols } } },
          },
        },
      })
    : null;

  const workflow = matching
    ? await db.query.approvalWorkflow.findFirst({
        where: eq(approvalWorkflow.id, matching.id),
        with: {
          steps: {
            orderBy: asc(approvalWorkflowStep.stepOrder),
            with: { approver: { with: { user: userCols } } },
          },
        },
      })
    : null;

  const currentStep =
    request?.status === "pending"
      ? request.workflow.steps.find((s) => s.stepOrder === request.currentStepOrder) ?? null
      : null;

  return {
    entityType,
    entityId,
    entityStatus: found.status,
    /** The active workflow that matches the record right now (null = none). */
    workflow,
    /** The latest non-cancelled approval request (null = never submitted). */
    request,
    currentStep,
    memberId: me?.id ?? null,
    isCurrentApprover: !!currentStep && !!me && currentStep.approverId === me.id,
    /** For journal entries / purchase orders: posting / sending is blocked until approved. */
    blocked:
      (entityType === "journal_entry" || entityType === "purchase_order") &&
      found.status === "draft" &&
      !!matching &&
      request?.status !== "approved",
  };
}

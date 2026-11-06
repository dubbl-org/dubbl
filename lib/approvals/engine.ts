import { db } from "@/lib/db";
import {
  approvalWorkflow,
  approvalWorkflowStep,
  approvalRequest,
  approvalAction,
  member,
} from "@/lib/db/schema";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import type { AuthContext } from "@/lib/api/auth-context";
import { ApprovalError } from "./errors";
import { notifyApprovalStep, notifySafely } from "@/lib/notifications/events";
import { emitApprovalCompleted, emitApprovalRequested } from "@/lib/webhooks/events";
import {
  approvalSubject,
  selectApprovalWorkflow,
  type ApprovalCondition,
  type ApprovalEntityType,
} from "./select";

export type { ApprovalEntityType } from "./select";

/**
 * Find the active approval workflow that applies to an entity. Only workflows
 * with at least one step are candidates; among the ones whose conditions all
 * match, the most specific (most conditions) wins and ties go to the oldest
 * (see selectApprovalWorkflow). Returns null when none applies.
 */
export async function checkApprovalRequired(
  orgId: string,
  entityType: ApprovalEntityType,
  entity: Record<string, unknown>
) {
  const workflows = await db.query.approvalWorkflow.findMany({
    where: and(
      eq(approvalWorkflow.organizationId, orgId),
      eq(approvalWorkflow.entityType, entityType),
      eq(approvalWorkflow.isActive, true),
      notDeleted(approvalWorkflow.deletedAt)
    ),
    with: {
      steps: {
        orderBy: asc(approvalWorkflowStep.stepOrder),
      },
    },
  });

  const candidates = workflows
    .filter((w) => w.steps.length > 0)
    .map((w) => ({ ...w, conditions: (w.conditions ?? []) as ApprovalCondition[] }));

  return selectApprovalWorkflow(candidates, approvalSubject(entityType, entity));
}

/**
 * Create an approval request for a given entity + workflow.
 */
export async function createApprovalRequest(
  orgId: string,
  workflowId: string,
  entityType: ApprovalEntityType,
  entityId: string,
  requestedById: string
) {
  const [request] = await db
    .insert(approvalRequest)
    .values({
      organizationId: orgId,
      workflowId,
      entityType,
      entityId,
      requestedById,
      currentStepOrder: 1,
    })
    .returning();

  // Tell the first approver it's their turn
  await notifySafely(notifyApprovalStep(request.id));
  emitApprovalRequested(orgId, request.id);
  return request;
}

/** The open (pending) approval request for an entity, if any. */
export async function findPendingApprovalRequest(
  orgId: string,
  entityType: ApprovalEntityType,
  entityId: string
) {
  return db.query.approvalRequest.findFirst({
    where: and(
      eq(approvalRequest.organizationId, orgId),
      eq(approvalRequest.entityType, entityType),
      eq(approvalRequest.entityId, entityId),
      eq(approvalRequest.status, "pending")
    ),
    orderBy: desc(approvalRequest.createdAt),
  });
}

/** The most recent non-cancelled approval request for an entity, if any. */
export async function findLatestApprovalRequest(
  orgId: string,
  entityType: ApprovalEntityType,
  entityId: string
) {
  return db.query.approvalRequest.findFirst({
    where: and(
      eq(approvalRequest.organizationId, orgId),
      eq(approvalRequest.entityType, entityType),
      eq(approvalRequest.entityId, entityId),
      inArray(approvalRequest.status, ["pending", "approved", "rejected"])
    ),
    orderBy: desc(approvalRequest.createdAt),
  });
}

/**
 * Cancel an entity's open approval (pending, and by default also an approval
 * already granted), e.g. when the record is recalled or edited so the old
 * sign-off no longer covers what will be posted.
 */
export async function cancelApprovalRequests(
  orgId: string,
  entityType: ApprovalEntityType,
  entityId: string,
  statuses: ("pending" | "approved")[] = ["pending", "approved"]
) {
  await db
    .update(approvalRequest)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(approvalRequest.organizationId, orgId),
        eq(approvalRequest.entityType, entityType),
        eq(approvalRequest.entityId, entityId),
        inArray(approvalRequest.status, statuses)
      )
    );
}

/** The caller's member record (approvals are keyed by member, not user). */
export async function resolveApprovalMember(ctx: AuthContext) {
  const mem = await db.query.member.findFirst({
    where: and(
      eq(member.organizationId, ctx.organizationId),
      eq(member.userId, ctx.userId)
    ),
  });
  if (!mem) throw new ApprovalError("Member not found", 403);
  return mem;
}

/**
 * Process an approval action (approve, reject, or comment).
 * Advances the workflow or finalizes the request status. Pass organizationId
 * to make sure the request belongs to the caller's organization.
 */
export async function processApprovalAction(
  requestId: string,
  memberId: string,
  action: "approve" | "reject" | "comment",
  comment?: string,
  organizationId?: string
) {
  const request = await db.query.approvalRequest.findFirst({
    where: organizationId
      ? and(
          eq(approvalRequest.id, requestId),
          eq(approvalRequest.organizationId, organizationId)
        )
      : eq(approvalRequest.id, requestId),
    with: {
      workflow: {
        with: {
          steps: {
            orderBy: asc(approvalWorkflowStep.stepOrder),
          },
        },
      },
    },
  });

  if (!request) {
    throw new ApprovalError("Approval request not found", 404);
  }

  if (request.status !== "pending") {
    throw new ApprovalError("Approval request is no longer pending", 409);
  }

  const currentStep = request.workflow.steps.find(
    (s) => s.stepOrder === request.currentStepOrder
  );

  if (!currentStep) {
    throw new ApprovalError("Current workflow step not found", 409);
  }

  // For approve/reject, verify the member is the approver for the current step
  if (action !== "comment" && currentStep.approverId !== memberId) {
    throw new ApprovalError("You are not the approver for the current step", 403);
  }

  // Comments don't change request status
  if (action === "comment") {
    await db.insert(approvalAction).values({
      requestId,
      stepId: currentStep.id,
      userId: memberId,
      action,
      comment: comment ?? null,
    });
    return request;
  }

  // Only move the request on if nobody else acted on this step in the meantime
  // (two clicks at once must not both count).
  const stillOnStep = and(
    eq(approvalRequest.id, requestId),
    eq(approvalRequest.status, "pending"),
    eq(approvalRequest.currentStepOrder, request.currentStepOrder)
  );

  const maxStep = Math.max(...request.workflow.steps.map((s) => s.stepOrder));
  const next =
    action === "reject"
      ? // Rejected at any step rejects the entire request
        { status: "rejected" as const }
      : request.currentStepOrder >= maxStep
        ? // Last step approved - mark fully approved
          { status: "approved" as const }
        : // Advance to next step
          { currentStepOrder: request.currentStepOrder + 1 };

  const [updated] = await db
    .update(approvalRequest)
    .set({ ...next, updatedAt: new Date() })
    .where(stillOnStep)
    .returning();

  if (!updated) {
    throw new ApprovalError("This step was already acted on. Refresh and try again.", 409);
  }

  // Record the action
  await db.insert(approvalAction).values({
    requestId,
    stepId: currentStep.id,
    userId: memberId,
    action,
    comment: comment ?? null,
  });

  // Moved to the next step: tell that step's approver (no-op once approved/rejected)
  await notifySafely(notifyApprovalStep(requestId));
  if (updated.status === "approved" || updated.status === "rejected") {
    emitApprovalCompleted(updated.organizationId, updated.id);
  }
  return updated;
}

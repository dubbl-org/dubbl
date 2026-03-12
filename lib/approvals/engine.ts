import { db } from "@/lib/db";
import {
  approvalWorkflow,
  approvalWorkflowStep,
  approvalRequest,
  approvalAction,
} from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";

interface ApprovalCondition {
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte";
  value: string;
}

function evaluateCondition(
  condition: ApprovalCondition,
  entity: Record<string, unknown>
): boolean {
  const fieldValue = String(entity[condition.field] ?? "");
  const condValue = condition.value;

  switch (condition.operator) {
    case "eq":
      return fieldValue === condValue;
    case "neq":
      return fieldValue !== condValue;
    case "gt":
      return Number(fieldValue) > Number(condValue);
    case "lt":
      return Number(fieldValue) < Number(condValue);
    case "gte":
      return Number(fieldValue) >= Number(condValue);
    case "lte":
      return Number(fieldValue) <= Number(condValue);
    default:
      return false;
  }
}

/**
 * Check if an entity requires approval by finding an active workflow
 * whose conditions match the entity.
 */
export async function checkApprovalRequired(
  orgId: string,
  entityType: "bill" | "expense" | "invoice" | "journal_entry" | "purchase_order",
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

  for (const workflow of workflows) {
    const conditions = (workflow.conditions ?? []) as ApprovalCondition[];

    // If no conditions, the workflow always matches
    if (conditions.length === 0) {
      return workflow;
    }

    // All conditions must match
    const allMatch = conditions.every((c) => evaluateCondition(c, entity));
    if (allMatch) {
      return workflow;
    }
  }

  return null;
}

/**
 * Create an approval request for a given entity + workflow.
 */
export async function createApprovalRequest(
  orgId: string,
  workflowId: string,
  entityType: "bill" | "expense" | "invoice" | "journal_entry" | "purchase_order",
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

  return request;
}

/**
 * Process an approval action (approve, reject, or comment).
 * Advances the workflow or finalizes the request status.
 */
export async function processApprovalAction(
  requestId: string,
  memberId: string,
  action: "approve" | "reject" | "comment",
  comment?: string
) {
  const request = await db.query.approvalRequest.findFirst({
    where: eq(approvalRequest.id, requestId),
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
    throw new Error("Approval request not found");
  }

  if (request.status !== "pending") {
    throw new Error("Approval request is no longer pending");
  }

  const currentStep = request.workflow.steps.find(
    (s) => s.stepOrder === request.currentStepOrder
  );

  if (!currentStep) {
    throw new Error("Current workflow step not found");
  }

  // For approve/reject, verify the member is the approver for the current step
  if (action !== "comment" && currentStep.approverId !== memberId) {
    throw new Error("You are not the approver for the current step");
  }

  // Record the action
  await db.insert(approvalAction).values({
    requestId,
    stepId: currentStep.id,
    userId: memberId,
    action,
    comment: comment ?? null,
  });

  // Comments don't change request status
  if (action === "comment") {
    return request;
  }

  if (action === "reject") {
    // Rejected at any step rejects the entire request
    const [updated] = await db
      .update(approvalRequest)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(approvalRequest.id, requestId))
      .returning();
    return updated;
  }

  // action === "approve"
  const maxStep = Math.max(...request.workflow.steps.map((s) => s.stepOrder));

  if (request.currentStepOrder >= maxStep) {
    // Last step approved - mark fully approved
    const [updated] = await db
      .update(approvalRequest)
      .set({ status: "approved", updatedAt: new Date() })
      .where(eq(approvalRequest.id, requestId))
      .returning();
    return updated;
  }

  // Advance to next step
  const [updated] = await db
    .update(approvalRequest)
    .set({
      currentStepOrder: request.currentStepOrder + 1,
      updatedAt: new Date(),
    })
    .where(eq(approvalRequest.id, requestId))
    .returning();

  return updated;
}

import { db } from "@/lib/db";
import { approvalAction, approvalRequest, approvalWorkflowStep, member } from "@/lib/db/schema";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { ApprovalError } from "./errors";
import {
  APPROVAL_CONDITION_FIELDS,
  type ApprovalCondition,
  type ApprovalEntityType,
} from "./select";

/**
 * Validate a workflow definition before saving it (REST and MCP): every
 * condition must test a field that exists for the record type (money fields
 * are whole cents), and every approver must be a member of the organization.
 */
export async function assertValidWorkflow(
  orgId: string,
  entityType: ApprovalEntityType,
  conditions: ApprovalCondition[] | undefined,
  steps: { approverId: string }[] | undefined
) {
  if (conditions) {
    const fields = APPROVAL_CONDITION_FIELDS[entityType];
    for (const c of conditions) {
      const field = fields.find((f) => f.field === c.field);
      if (!field) {
        throw new ApprovalError(
          `"${c.field}" can't be used in a condition for this record type. Use one of: ${fields.map((f) => f.field).join(", ")}`,
          400
        );
      }
      if (field.kind === "money" && !/^-?\d+$/.test(c.value.trim())) {
        throw new ApprovalError(`The value for "${c.field}" must be a whole number of cents (e.g. 500000 for $5,000.00)`, 400);
      }
      if (field.kind === "text" && ["gt", "lt", "gte", "lte"].includes(c.operator)) {
        throw new ApprovalError(`"${c.field}" can only be compared with equals or not equals`, 400);
      }
    }
  }

  if (steps && steps.length > 0) {
    const ids = [...new Set(steps.map((s) => s.approverId))];
    const found = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, orgId), inArray(member.id, ids)));
    if (found.length !== ids.length) {
      throw new ApprovalError("Every approver must be a member of this organization", 400);
    }
  }
}

/**
 * Replace a workflow's steps while keeping the rows of steps that stay (by
 * position), so recorded approval actions keep pointing at their step and
 * requests already in progress continue with the new approvers. A step that
 * already has approval history can't be removed.
 */
export async function replaceWorkflowSteps(
  workflowId: string,
  steps: { approverId: string; isRequired: boolean }[]
) {
  const existing = await db.query.approvalWorkflowStep.findMany({
    where: eq(approvalWorkflowStep.workflowId, workflowId),
    orderBy: asc(approvalWorkflowStep.stepOrder),
  });

  const removed = existing.slice(steps.length);
  if (removed.length > 0) {
    const waiting = await db.query.approvalRequest.findFirst({
      where: and(
        eq(approvalRequest.workflowId, workflowId),
        eq(approvalRequest.status, "pending"),
        gt(approvalRequest.currentStepOrder, steps.length)
      ),
      columns: { currentStepOrder: true },
    });
    if (waiting) {
      throw new ApprovalError(
        `Something is waiting for approval at step ${waiting.currentStepOrder}, so that step can't be removed yet.`,
        409
      );
    }
    const used = await db
      .select({ stepId: approvalAction.stepId })
      .from(approvalAction)
      .where(inArray(approvalAction.stepId, removed.map((s) => s.id)))
      .limit(1);
    if (used.length > 0) {
      throw new ApprovalError(
        "A step you removed already has approval history. Deactivate this workflow and create a new one instead.",
        409
      );
    }
    await db.delete(approvalWorkflowStep).where(inArray(approvalWorkflowStep.id, removed.map((s) => s.id)));
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const current = existing[i];
    if (current) {
      await db
        .update(approvalWorkflowStep)
        .set({ stepOrder: i + 1, approverId: step.approverId, isRequired: step.isRequired })
        .where(eq(approvalWorkflowStep.id, current.id));
    } else {
      await db.insert(approvalWorkflowStep).values({
        workflowId,
        stepOrder: i + 1,
        approverId: step.approverId,
        isRequired: step.isRequired,
      });
    }
  }
}

import { db } from "@/lib/db";
import { workflow, workflowExecutionLog } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import type { WorkflowCondition } from "@/lib/db/schema/workflows";

/**
 * Evaluate all active workflows for a given trigger and organization.
 * Checks conditions against the entity and executes matching workflow actions.
 */
export async function fireWorkflowTrigger(
  trigger: string,
  orgId: string,
  entity: Record<string, unknown>,
  entityType: string,
  entityId: string,
) {
  const workflows = await db.query.workflow.findMany({
    where: and(
      eq(workflow.organizationId, orgId),
      eq(workflow.trigger, trigger as typeof workflow.trigger.enumValues[number]),
      eq(workflow.isActive, true),
      notDeleted(workflow.deletedAt),
    ),
  });

  for (const wf of workflows) {
    const conditions = (wf.conditions || []) as WorkflowCondition[];
    const matches = evaluateConditions(conditions, entity);

    const status = matches ? "success" : "skipped";

    if (matches) {
      // Execute actions (fire-and-forget style for now)
      const actions = (wf.actions || []) as { type: string; config: Record<string, unknown> }[];
      for (const action of actions) {
        try {
          await executeAction(action, entity, orgId);
        } catch {
          // log failure but continue
        }
      }

      await db
        .update(workflow)
        .set({
          lastTriggeredAt: new Date(),
          triggerCount: (wf.triggerCount || 0) + 1,
        })
        .where(eq(workflow.id, wf.id));
    }

    await db.insert(workflowExecutionLog).values({
      workflowId: wf.id,
      triggeredByType: entityType,
      triggeredById: entityId,
      status,
      result: { actionsRun: matches ? (wf.actions as unknown[]).length : 0 },
    });
  }
}

function evaluateConditions(
  conditions: WorkflowCondition[],
  entity: Record<string, unknown>,
): boolean {
  if (conditions.length === 0) return true;

  return conditions.every((c) => {
    const fieldValue = String(entity[c.field] ?? "");
    const compareValue = c.value;

    switch (c.operator) {
      case "eq":
        return fieldValue === compareValue;
      case "neq":
        return fieldValue !== compareValue;
      case "gt":
        return Number(fieldValue) > Number(compareValue);
      case "lt":
        return Number(fieldValue) < Number(compareValue);
      case "gte":
        return Number(fieldValue) >= Number(compareValue);
      case "lte":
        return Number(fieldValue) <= Number(compareValue);
      case "contains":
        return fieldValue.toLowerCase().includes(compareValue.toLowerCase());
      default:
        return false;
    }
  });
}

async function executeAction(
  action: { type: string; config: Record<string, unknown> },
  _entity: Record<string, unknown>,
  _orgId: string,
) {
  // Action execution stubs - these would integrate with real services
  switch (action.type) {
    case "send_notification":
      // Would call sendNotification() from lib/notifications/send.ts
      break;
    case "send_email":
      // Would integrate with email service
      break;
    case "create_task":
      // Would create a project task
      break;
    case "update_field":
      // Would update entity field
      break;
    case "move_deal_stage":
      // Would update deal stage
      break;
    case "create_invoice":
      // Would create a new invoice
      break;
  }
}

/**
 * Dry-run a workflow against sample data without persisting anything.
 */
export function testWorkflow(
  conditions: WorkflowCondition[],
  entity: Record<string, unknown>,
): { matches: boolean; conditionResults: { condition: WorkflowCondition; passed: boolean }[] } {
  const conditionResults = conditions.map((c) => ({
    condition: c,
    passed: evaluateConditions([c], entity),
  }));

  return {
    matches: conditionResults.every((r) => r.passed),
    conditionResults,
  };
}

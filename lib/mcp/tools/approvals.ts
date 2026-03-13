import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  approvalWorkflow,
  approvalWorkflowStep,
  approvalRequest,
  member,
} from "@/lib/db/schema";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { processApprovalAction } from "@/lib/approvals/engine";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerApprovalTools(server: McpServer, ctx: AuthContext) {
  // ── List approval workflows ──
  server.tool(
    "list_approval_workflows",
    "List approval workflows for the organization, optionally filtered by entity type.",
    {
      entityType: z
        .enum(["bill", "expense", "invoice", "journal_entry", "purchase_order"])
        .optional()
        .describe("Filter by entity type"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of workflows to return (max 100)"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(approvalWorkflow.organizationId, ctx.organizationId),
          notDeleted(approvalWorkflow.deletedAt),
        ];

        if (params.entityType) {
          conditions.push(eq(approvalWorkflow.entityType, params.entityType));
        }

        const offset = (params.page - 1) * params.limit;

        const workflows = await db.query.approvalWorkflow.findMany({
          where: and(...conditions),
          orderBy: desc(approvalWorkflow.createdAt),
          limit: params.limit,
          offset,
          with: {
            steps: {
              orderBy: asc(approvalWorkflowStep.stepOrder),
              with: { approver: { with: { user: true } } },
            },
          },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(approvalWorkflow)
          .where(and(...conditions));

        return {
          workflows,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  // ── Create approval workflow ──
  server.tool(
    "create_approval_workflow",
    "Create an approval workflow with ordered steps. Each step specifies a member who must approve.",
    {
      name: z.string().describe("Workflow name"),
      entityType: z
        .enum(["bill", "expense", "invoice", "journal_entry", "purchase_order"])
        .describe("Entity type this workflow applies to"),
      conditions: z
        .array(
          z.object({
            field: z.string().describe("Entity field to evaluate"),
            operator: z
              .enum(["eq", "neq", "gt", "lt", "gte", "lte"])
              .describe("Comparison operator"),
            value: z.string().describe("Value to compare against"),
          })
        )
        .optional()
        .default([])
        .describe("Conditions that must all match for the workflow to apply"),
      isActive: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether the workflow is active"),
      steps: z
        .array(
          z.object({
            approverId: z.string().describe("Member UUID of the approver"),
            isRequired: z
              .boolean()
              .optional()
              .default(true)
              .describe("Whether this step is required"),
          })
        )
        .min(1)
        .describe("Ordered list of approval steps"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bills");

        const [workflow] = await db
          .insert(approvalWorkflow)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            entityType: params.entityType,
            conditions: params.conditions,
            isActive: params.isActive,
          })
          .returning();

        await db.insert(approvalWorkflowStep).values(
          params.steps.map((step, i) => ({
            workflowId: workflow.id,
            stepOrder: i + 1,
            approverId: step.approverId,
            isRequired: step.isRequired,
          }))
        );

        const created = await db.query.approvalWorkflow.findFirst({
          where: eq(approvalWorkflow.id, workflow.id),
          with: {
            steps: {
              orderBy: asc(approvalWorkflowStep.stepOrder),
              with: { approver: { with: { user: true } } },
            },
          },
        });

        return { workflow: created };
      })
  );

  // ── Update approval workflow ──
  server.tool(
    "update_approval_workflow",
    "Update an existing approval workflow. Provide only the fields to change. If steps are provided, they replace all existing steps.",
    {
      workflowId: z.string().describe("The UUID of the workflow to update"),
      name: z.string().optional().describe("New workflow name"),
      entityType: z
        .enum(["bill", "expense", "invoice", "journal_entry", "purchase_order"])
        .optional()
        .describe("New entity type"),
      conditions: z
        .array(
          z.object({
            field: z.string().describe("Entity field to evaluate"),
            operator: z
              .enum(["eq", "neq", "gt", "lt", "gte", "lte"])
              .describe("Comparison operator"),
            value: z.string().describe("Value to compare against"),
          })
        )
        .optional()
        .describe("New conditions (replaces existing)"),
      isActive: z.boolean().optional().describe("Set active status"),
      steps: z
        .array(
          z.object({
            approverId: z.string().describe("Member UUID of the approver"),
            isRequired: z
              .boolean()
              .optional()
              .default(true)
              .describe("Whether this step is required"),
          })
        )
        .min(1)
        .optional()
        .describe("New ordered steps (replaces existing)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bills");

        const existing = await db.query.approvalWorkflow.findFirst({
          where: and(
            eq(approvalWorkflow.id, params.workflowId),
            eq(approvalWorkflow.organizationId, ctx.organizationId),
            notDeleted(approvalWorkflow.deletedAt)
          ),
        });

        if (!existing) throw new Error("Approval workflow not found");

        const { workflowId, steps, ...fields } = params;

        if (Object.keys(fields).length > 0) {
          await db
            .update(approvalWorkflow)
            .set({ ...fields, updatedAt: new Date() })
            .where(eq(approvalWorkflow.id, workflowId));
        }

        if (steps) {
          await db
            .delete(approvalWorkflowStep)
            .where(eq(approvalWorkflowStep.workflowId, workflowId));
          await db.insert(approvalWorkflowStep).values(
            steps.map((step, i) => ({
              workflowId,
              stepOrder: i + 1,
              approverId: step.approverId,
              isRequired: step.isRequired,
            }))
          );
        }

        const updated = await db.query.approvalWorkflow.findFirst({
          where: eq(approvalWorkflow.id, workflowId),
          with: {
            steps: {
              orderBy: asc(approvalWorkflowStep.stepOrder),
              with: { approver: { with: { user: true } } },
            },
          },
        });

        return { workflow: updated };
      })
  );

  // ── Delete approval workflow ──
  server.tool(
    "delete_approval_workflow",
    "Soft-delete an approval workflow.",
    {
      workflowId: z.string().describe("The UUID of the workflow to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:bills");

        const existing = await db.query.approvalWorkflow.findFirst({
          where: and(
            eq(approvalWorkflow.id, params.workflowId),
            eq(approvalWorkflow.organizationId, ctx.organizationId),
            notDeleted(approvalWorkflow.deletedAt)
          ),
        });

        if (!existing) throw new Error("Approval workflow not found");

        await db
          .update(approvalWorkflow)
          .set(softDelete())
          .where(eq(approvalWorkflow.id, params.workflowId));

        return { success: true };
      })
  );

  // ── List approval requests ──
  server.tool(
    "list_approval_requests",
    "List approval requests, optionally filtered by entity type and/or status.",
    {
      entityType: z
        .enum(["bill", "expense", "invoice", "journal_entry", "purchase_order"])
        .optional()
        .describe("Filter by entity type"),
      status: z
        .enum(["pending", "approved", "rejected", "cancelled"])
        .optional()
        .describe("Filter by request status"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of requests to return (max 100)"),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .default(1)
        .describe("Page number"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(approvalRequest.organizationId, ctx.organizationId),
        ];

        if (params.entityType) {
          conditions.push(eq(approvalRequest.entityType, params.entityType));
        }
        if (params.status) {
          conditions.push(eq(approvalRequest.status, params.status));
        }

        const offset = (params.page - 1) * params.limit;

        const requests = await db.query.approvalRequest.findMany({
          where: and(...conditions),
          orderBy: desc(approvalRequest.createdAt),
          limit: params.limit,
          offset,
          with: {
            workflow: true,
            requestedBy: { with: { user: true } },
          },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(approvalRequest)
          .where(and(...conditions));

        return {
          requests,
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  // ── Get approval request detail ──
  server.tool(
    "get_approval_request",
    "Get full details of an approval request including all actions and workflow steps.",
    {
      requestId: z.string().describe("The UUID of the approval request"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const request = await db.query.approvalRequest.findFirst({
          where: and(
            eq(approvalRequest.id, params.requestId),
            eq(approvalRequest.organizationId, ctx.organizationId)
          ),
          with: {
            workflow: {
              with: {
                steps: {
                  orderBy: asc(approvalWorkflowStep.stepOrder),
                  with: { approver: { with: { user: true } } },
                },
              },
            },
            requestedBy: { with: { user: true } },
            actions: {
              with: { user: { with: { user: true } }, step: true },
            },
          },
        });

        if (!request) throw new Error("Approval request not found");
        return { request };
      })
  );

  // ── Approve request ──
  server.tool(
    "approve_request",
    "Approve the current step of an approval request. You must be the assigned approver for the current step.",
    {
      requestId: z.string().describe("The UUID of the approval request"),
      comment: z.string().optional().describe("Optional comment"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const mem = await db.query.member.findFirst({
          where: and(
            eq(member.organizationId, ctx.organizationId),
            eq(member.userId, ctx.userId)
          ),
        });

        if (!mem) throw new Error("Member not found");

        const updated = await processApprovalAction(
          params.requestId,
          mem.id,
          "approve",
          params.comment
        );

        return { request: updated };
      })
  );

  // ── Reject request ──
  server.tool(
    "reject_request",
    "Reject an approval request. You must be the assigned approver for the current step.",
    {
      requestId: z.string().describe("The UUID of the approval request"),
      comment: z.string().optional().describe("Optional comment explaining the rejection"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const mem = await db.query.member.findFirst({
          where: and(
            eq(member.organizationId, ctx.organizationId),
            eq(member.userId, ctx.userId)
          ),
        });

        if (!mem) throw new Error("Member not found");

        const updated = await processApprovalAction(
          params.requestId,
          mem.id,
          "reject",
          params.comment
        );

        return { request: updated };
      })
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  approvalWorkflow,
  approvalWorkflowStep,
  approvalRequest,
} from "@/lib/db/schema";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { processApprovalAction, resolveApprovalMember } from "@/lib/approvals/engine";
import { approveEntity, rejectEntity, getApprovalStatus, submitForApproval } from "@/lib/approvals/entities";
import { assertValidWorkflow, replaceWorkflowSteps } from "@/lib/approvals/workflows";
import { ApprovalError } from "@/lib/approvals/errors";
import { APPROVAL_ENTITY_TYPES } from "@/lib/approvals/select";
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
    "Create an approval workflow with ordered steps (requires manage:approvals). Each step names the member (member UUID, see list_workspace_members) who must approve, in order. Conditions must all match for the workflow to apply; with none it applies to every record of that type. When several active workflows match a record, the one with the most conditions wins, then the oldest. Money condition values are integer cents. Returns the workflow with its steps.",
    {
      name: z.string().describe("Workflow name"),
      entityType: z
        .enum(["bill", "expense", "invoice", "journal_entry", "purchase_order"])
        .describe("Entity type this workflow applies to"),
      conditions: z
        .array(
          z.object({
            field: z
              .string()
              .describe(
                "Field to test. bill/invoice/purchase_order: total, subtotal, taxTotal, currencyCode. expense: total, currencyCode. journal_entry: total (sum of debits)."
              ),
            operator: z
              .enum(["eq", "neq", "gt", "lt", "gte", "lte"])
              .describe("Comparison operator"),
            value: z
              .string()
              .describe(
                "Value to compare against, as a string. Money fields are integer cents (\"500000\" = $5,000.00); currencyCode is an ISO code like \"USD\" (eq/neq only)."
              ),
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
        requireRole(ctx, "manage:approvals");
        await assertValidWorkflow(ctx.organizationId, params.entityType, params.conditions, params.steps);

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
    "Update an existing approval workflow (requires manage:approvals). Provide only the fields to change. If steps are provided, they replace the existing steps in order (requests already in progress continue with the new approvers; a step with approval history can't be removed). Money condition values are integer cents. Returns the workflow with its steps.",
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
            field: z
              .string()
              .describe(
                "Field to test. bill/invoice/purchase_order: total, subtotal, taxTotal, currencyCode. expense: total, currencyCode. journal_entry: total (sum of debits)."
              ),
            operator: z
              .enum(["eq", "neq", "gt", "lt", "gte", "lte"])
              .describe("Comparison operator"),
            value: z
              .string()
              .describe(
                "Value to compare against, as a string. Money fields are integer cents (\"500000\" = $5,000.00); currencyCode is an ISO code like \"USD\" (eq/neq only)."
              ),
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
        requireRole(ctx, "manage:approvals");

        const existing = await db.query.approvalWorkflow.findFirst({
          where: and(
            eq(approvalWorkflow.id, params.workflowId),
            eq(approvalWorkflow.organizationId, ctx.organizationId),
            notDeleted(approvalWorkflow.deletedAt)
          ),
        });

        if (!existing) throw new Error("Approval workflow not found");

        const { workflowId, steps, ...fields } = params;
        await assertValidWorkflow(
          ctx.organizationId,
          params.entityType ?? existing.entityType,
          params.conditions ?? (params.entityType ? existing.conditions : undefined),
          steps
        );

        if (Object.keys(fields).length > 0) {
          await db
            .update(approvalWorkflow)
            .set({ ...fields, updatedAt: new Date() })
            .where(eq(approvalWorkflow.id, workflowId));
        }

        if (steps) {
          await replaceWorkflowSteps(workflowId, steps);
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
    "Soft-delete an approval workflow (requires manage:approvals). Requests already in progress keep going. Returns success.",
    {
      workflowId: z.string().describe("The UUID of the workflow to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:approvals");

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

  // ── Approval status of one record ──
  server.tool(
    "get_approval_status",
    "Show where one record stands in its approval workflow: the active workflow that matches it (null = none), its latest approval request with steps, approvers and actions (null = never submitted), the current step, whether you are the current step's approver, and blocked (journal entries / purchase orders: true while posting / sending needs an approval first).",
    {
      entityType: z
        .enum(APPROVAL_ENTITY_TYPES)
        .describe("Record type: bill, expense, invoice, journal_entry or purchase_order"),
      entityId: z.string().describe("The UUID of the record"),
    },
    (params) =>
      wrapTool(ctx, async () => getApprovalStatus(ctx, params.entityType, params.entityId))
  );

  // ── Approve request ──
  server.tool(
    "approve_request",
    "Approve the current step of a pending approval request. You must be the assigned approver for the current step (bills, expenses and invoices also need the matching approve permission). When this was the last step the record moves on exactly as its own approve tool would: a bill posts to the ledger, an expense claim posts its approval entry, an invoice returns to draft ready to send, and a journal entry / purchase order can now be posted / sent. Returns the request, the record and finalized (true once fully approved).",
    {
      requestId: z.string().describe("The UUID of the approval request"),
      comment: z.string().optional().describe("Optional comment"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const request = await loadPendingRequest(params.requestId);
        const outcome = await approveEntity(ctx, request.entityType, request.entityId, params.comment);
        return { request: outcome.request, entity: outcome.entity, finalized: outcome.finalized };
      })
  );

  // ── Reject request ──
  server.tool(
    "reject_request",
    "Reject a pending approval request. You must be the assigned approver for the current step (bills, expenses and invoices also need the matching approve permission). A rejection at any step rejects the whole request and the record moves on as its own reject tool would: a bill goes back to draft, an expense claim and an invoice become rejected, a journal entry / purchase order stays a draft that can be resubmitted. Expense claims need a comment (it becomes the rejection reason). Returns the request and the record.",
    {
      requestId: z.string().describe("The UUID of the approval request"),
      comment: z.string().optional().describe("Reason for the rejection (required for expense claims)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const request = await loadPendingRequest(params.requestId);
        const outcome = await rejectEntity(ctx, request.entityType, request.entityId, params.comment);
        return { request: outcome.request, entity: outcome.entity };
      })
  );

  // ── Comment on request ──
  server.tool(
    "comment_on_request",
    "Add a comment to a pending approval request without approving or rejecting it. Any member can comment. Returns the request.",
    {
      requestId: z.string().describe("The UUID of the approval request"),
      comment: z.string().min(1).describe("The comment text"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const mem = await resolveApprovalMember(ctx);
        const request = await processApprovalAction(
          params.requestId,
          mem.id,
          "comment",
          params.comment,
          ctx.organizationId
        );
        return { request };
      })
  );

  // ── Purchase orders ──
  server.tool(
    "submit_purchase_order_for_approval",
    "Send a draft purchase order to its approval workflow. Only needed when an active approval workflow for purchase orders matches the order (condition fields: total, subtotal, taxTotal in integer cents, currencyCode); then the order can't be sent to the supplier until every step approves. Opens an approval request and notifies the first approver; the order stays a draft. Fails when no workflow applies or the order is already waiting for / has approval. Returns the approval request.",
    {
      purchaseOrderId: z.string().describe("The UUID of the draft purchase order"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const outcome = await submitForApproval(ctx, "purchase_order", params.purchaseOrderId);
        return { request: outcome.request };
      })
  );

  server.tool(
    "approve_purchase_order",
    "Approve the current step of a draft purchase order's approval request. Only the member named as that step's approver can act. After the last step the request is approved and the order can be sent. Returns the request and approved (true once every step has approved).",
    {
      purchaseOrderId: z.string().describe("The UUID of the draft purchase order"),
      comment: z.string().optional().describe("Optional comment recorded with the approval"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const outcome = await approveEntity(ctx, "purchase_order", params.purchaseOrderId, params.comment);
        return { request: outcome.request, approved: outcome.finalized };
      })
  );

  server.tool(
    "reject_purchase_order",
    "Reject a draft purchase order's approval request (current step's approver only). The whole request is rejected; the order stays a draft that can be edited and submitted again. Returns the request.",
    {
      purchaseOrderId: z.string().describe("The UUID of the draft purchase order"),
      reason: z.string().optional().describe("Why the order is rejected"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const outcome = await rejectEntity(ctx, "purchase_order", params.purchaseOrderId, params.reason);
        return { request: outcome.request };
      })
  );

  /** A pending approval request in this organization. */
  async function loadPendingRequest(requestId: string) {
    const request = await db.query.approvalRequest.findFirst({
      where: and(
        eq(approvalRequest.id, requestId),
        eq(approvalRequest.organizationId, ctx.organizationId)
      ),
    });
    if (!request) throw new ApprovalError("Approval request not found", 404);
    if (request.status !== "pending") {
      throw new ApprovalError("Approval request is no longer pending", 409);
    }
    return request;
  }
}

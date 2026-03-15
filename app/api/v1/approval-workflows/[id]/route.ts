import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { approvalWorkflow, approvalWorkflowStep } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, notFound } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  entityType: z
    .enum(["bill", "expense", "invoice", "journal_entry", "purchase_order"])
    .optional(),
  conditions: z
    .array(
      z.object({
        field: z.string().min(1),
        operator: z.enum(["eq", "neq", "gt", "lt", "gte", "lte"]),
        value: z.string(),
      })
    )
    .optional(),
  isActive: z.boolean().optional(),
  steps: z
    .array(
      z.object({
        approverId: z.string().uuid(),
        isRequired: z.boolean().default(true),
      })
    )
    .min(1)
    .optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const workflow = await db.query.approvalWorkflow.findFirst({
      where: and(
        eq(approvalWorkflow.id, id),
        eq(approvalWorkflow.organizationId, ctx.organizationId),
        notDeleted(approvalWorkflow.deletedAt)
      ),
      with: {
        steps: {
          orderBy: asc(approvalWorkflowStep.stepOrder),
          with: { approver: { with: { user: true } } },
        },
      },
    });

    if (!workflow) return notFound("Approval workflow");
    return NextResponse.json({ workflow });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bills");

    const existing = await db.query.approvalWorkflow.findFirst({
      where: and(
        eq(approvalWorkflow.id, id),
        eq(approvalWorkflow.organizationId, ctx.organizationId),
        notDeleted(approvalWorkflow.deletedAt)
      ),
    });

    if (!existing) return notFound("Approval workflow");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const { steps, ...workflowFields } = parsed;

    if (Object.keys(workflowFields).length > 0) {
      await db
        .update(approvalWorkflow)
        .set({ ...workflowFields, updatedAt: new Date() })
        .where(eq(approvalWorkflow.id, id));
    }

    // Replace steps if provided
    if (steps) {
      await db
        .delete(approvalWorkflowStep)
        .where(eq(approvalWorkflowStep.workflowId, id));
      await db.insert(approvalWorkflowStep).values(
        steps.map((step, i) => ({
          workflowId: id,
          stepOrder: i + 1,
          approverId: step.approverId,
          isRequired: step.isRequired,
        }))
      );
    }

    const updated = await db.query.approvalWorkflow.findFirst({
      where: eq(approvalWorkflow.id, id),
      with: {
        steps: {
          orderBy: asc(approvalWorkflowStep.stepOrder),
          with: { approver: { with: { user: true } } },
        },
      },
    });

    return NextResponse.json({ workflow: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bills");

    const existing = await db.query.approvalWorkflow.findFirst({
      where: and(
        eq(approvalWorkflow.id, id),
        eq(approvalWorkflow.organizationId, ctx.organizationId),
        notDeleted(approvalWorkflow.deletedAt)
      ),
    });

    if (!existing) return notFound("Approval workflow");

    await db
      .update(approvalWorkflow)
      .set(softDelete())
      .where(eq(approvalWorkflow.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "approval_workflow",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

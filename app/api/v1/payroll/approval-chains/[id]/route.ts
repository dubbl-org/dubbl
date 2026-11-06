import { db } from "@/lib/db";
import { approvalChain, approvalChainStep } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound, validationError } from "@/lib/api/response";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { approversInOrg } from "@/lib/api/payroll-run-actions";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  steps: z.array(z.object({
    stepOrder: z.number().int(),
    approverId: z.string().uuid(),
  })).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "approve:payroll");

    const chain = await db.query.approvalChain.findFirst({
      where: and(
        eq(approvalChain.id, id),
        eq(approvalChain.organizationId, ctx.organizationId),
        notDeleted(approvalChain.deletedAt)
      ),
      with: { steps: { with: { approver: { with: { user: { columns: { name: true, email: true } } } } } } },
    });

    if (!chain) return notFound("Approval chain");
    return ok({ chain });
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
    requireRole(ctx, "approve:payroll");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.approvalChain.findFirst({
      where: and(
        eq(approvalChain.id, id),
        eq(approvalChain.organizationId, ctx.organizationId),
        notDeleted(approvalChain.deletedAt)
      ),
      columns: { id: true },
    });
    if (!existing) return notFound("Approval chain");

    const { steps, ...chainUpdate } = parsed;
    if (steps && !(await approversInOrg(ctx.organizationId, steps.map((s) => s.approverId)))) {
      return validationError("Every approver must be a member of this workspace");
    }

    await db.transaction(async (tx) => {
      if (Object.keys(chainUpdate).length > 0) {
        await tx
          .update(approvalChain)
          .set(chainUpdate)
          .where(eq(approvalChain.id, id));
      }

      if (steps) {
        await tx.delete(approvalChainStep).where(eq(approvalChainStep.chainId, id));
        if (steps.length > 0) {
          await tx.insert(approvalChainStep).values(
            steps.map((s) => ({ chainId: id, ...s }))
          );
        }
      }
    });

    const chain = await db.query.approvalChain.findFirst({
      where: eq(approvalChain.id, id),
      with: { steps: { with: { approver: { with: { user: { columns: { name: true, email: true } } } } } } },
    });

    logAudit({ ctx, action: "update", entityType: "approvalChain", entityId: id, changes: parsed, request });

    return ok({ chain });
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
    requireRole(ctx, "approve:payroll");

    const [deleted] = await db
      .update(approvalChain)
      .set(softDelete())
      .where(and(
        eq(approvalChain.id, id),
        eq(approvalChain.organizationId, ctx.organizationId)
      ))
      .returning();

    if (!deleted) return notFound("Approval chain");

    logAudit({ ctx, action: "delete", entityType: "approvalChain", entityId: id, request });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

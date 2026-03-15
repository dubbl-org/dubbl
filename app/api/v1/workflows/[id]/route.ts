import { db } from "@/lib/db";
import { workflow } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { softDelete } from "@/lib/db/soft-delete";
import { ok, notFound, handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const wf = await db.query.workflow.findFirst({
      where: and(
        eq(workflow.id, id),
        eq(workflow.organizationId, ctx.organizationId),
        notDeleted(workflow.deletedAt),
      ),
      with: { logs: { limit: 20, orderBy: (l, { desc }) => [desc(l.executedAt)] } },
    });

    if (!wf) return notFound("Workflow");

    return ok({ workflow: wf });
  } catch (err) {
    return handleError(err);
  }
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  trigger: z
    .enum([
      "invoice_created",
      "invoice_overdue",
      "payment_received",
      "contact_created",
      "inventory_low",
      "deal_stage_changed",
      "payroll_processed",
    ])
    .optional(),
  conditions: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum(["eq", "neq", "gt", "lt", "gte", "lte", "contains"]),
        value: z.string(),
      }),
    )
    .optional(),
  actions: z
    .array(
      z.object({
        type: z.string(),
        config: z.record(z.string(), z.unknown()).optional().default({}),
      }),
    )
    .optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const existing = await db.query.workflow.findFirst({
      where: and(
        eq(workflow.id, id),
        eq(workflow.organizationId, ctx.organizationId),
        notDeleted(workflow.deletedAt),
      ),
    });
    if (!existing) return notFound("Workflow");

    const [updated] = await db
      .update(workflow)
      .set({ ...parsed, updatedAt: new Date() })
      .where(eq(workflow.id, id))
      .returning();

    return ok({ workflow: updated });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const existing = await db.query.workflow.findFirst({
      where: and(
        eq(workflow.id, id),
        eq(workflow.organizationId, ctx.organizationId),
        notDeleted(workflow.deletedAt),
      ),
    });
    if (!existing) return notFound("Workflow");

    await db.update(workflow).set(softDelete()).where(eq(workflow.id, id));

    logAudit({
      ctx,
      action: "delete",
      entityType: "workflow",
      entityId: id,
      changes: existing as Record<string, unknown>,
      request,
    });

    return ok({ success: true });
  } catch (err) {
    return handleError(err);
  }
}

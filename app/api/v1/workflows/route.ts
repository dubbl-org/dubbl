import { db } from "@/lib/db";
import { workflow } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, created, handleError } from "@/lib/api/response";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const workflows = await db.query.workflow.findMany({
      where: and(
        eq(workflow.organizationId, ctx.organizationId),
        notDeleted(workflow.deletedAt),
      ),
      orderBy: desc(workflow.createdAt),
    });

    return ok({ workflows });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  trigger: z.enum([
    "invoice_created",
    "invoice_overdue",
    "payment_received",
    "contact_created",
    "inventory_low",
    "deal_stage_changed",
    "payroll_processed",
  ]),
  conditions: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum(["eq", "neq", "gt", "lt", "gte", "lte", "contains"]),
        value: z.string(),
      }),
    )
    .optional()
    .default([]),
  actions: z
    .array(
      z.object({
        type: z.string(),
        config: z.record(z.string(), z.unknown()).optional().default({}),
      }),
    )
    .optional()
    .default([]),
  isActive: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [wf] = await db
      .insert(workflow)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        description: parsed.description || null,
        trigger: parsed.trigger,
        conditions: parsed.conditions,
        actions: parsed.actions,
        isActive: parsed.isActive,
      })
      .returning();

    return created({ workflow: wf });
  } catch (err) {
    return handleError(err);
  }
}

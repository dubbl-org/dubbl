import { db } from "@/lib/db";
import { employeeTaxConfig, payrollEmployee } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, notFound } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  filingStatus: z.enum(["single", "married_joint", "married_separate", "head_of_household"]).optional(),
  federalAllowances: z.number().int().min(0).optional(),
  stateAllowances: z.number().int().min(0).optional(),
  additionalWithholding: z.number().int().min(0).optional(),
  additionalStateWithholding: z.number().int().min(0).optional(),
  stateCode: z.string().trim().max(10).nullable().optional(),
  localCode: z.string().trim().max(20).nullable().optional(),
  exempt: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const emp = await db.query.payrollEmployee.findFirst({
      where: and(
        eq(payrollEmployee.id, id),
        eq(payrollEmployee.organizationId, ctx.organizationId),
        notDeleted(payrollEmployee.deletedAt)
      ),
    });
    if (!emp) return notFound("Employee");

    let config = await db.query.employeeTaxConfig.findFirst({
      where: eq(employeeTaxConfig.employeeId, id),
    });

    if (!config) {
      const [created] = await db
        .insert(employeeTaxConfig)
        .values({ employeeId: id })
        .returning();
      config = created;
    }

    return ok({ taxConfig: config });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const emp = await db.query.payrollEmployee.findFirst({
      where: and(
        eq(payrollEmployee.id, id),
        eq(payrollEmployee.organizationId, ctx.organizationId),
        notDeleted(payrollEmployee.deletedAt)
      ),
      columns: { id: true },
    });
    if (!emp) return notFound("Employee");

    const body = await request.json();
    const raw = updateSchema.parse(body);
    // Jurisdiction codes match tax bracket jurisdictions case-insensitively.
    const parsed = {
      ...raw,
      ...(raw.stateCode !== undefined ? { stateCode: raw.stateCode ? raw.stateCode.toUpperCase() : null } : {}),
      ...(raw.localCode !== undefined ? { localCode: raw.localCode ? raw.localCode.toUpperCase() : null } : {}),
    };

    let config = await db.query.employeeTaxConfig.findFirst({
      where: eq(employeeTaxConfig.employeeId, id),
    });

    if (!config) {
      const [created] = await db
        .insert(employeeTaxConfig)
        .values({ employeeId: id, ...parsed })
        .returning();
      config = created;
    } else {
      const [updated] = await db
        .update(employeeTaxConfig)
        .set({ ...parsed, updatedAt: new Date() })
        .where(eq(employeeTaxConfig.employeeId, id))
        .returning();
      config = updated;
    }

    logAudit({ ctx, action: "update", entityType: "employeeTaxConfig", entityId: config.id, changes: parsed, request });

    return ok({ taxConfig: config });
  } catch (err) {
    return handleError(err);
  }
}

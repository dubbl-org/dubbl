import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payrollSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const updateSchema = z.object({
  defaultTaxRate: z.number().int().min(0).max(10000).optional(),
  overtimeThresholdHours: z.number().min(0).optional(),
  overtimeMultiplier: z.number().min(1).optional(),
  defaultCurrency: z.string().min(1).max(3).optional(),
  salaryExpenseAccountCode: z.string().optional(),
  taxPayableAccountCode: z.string().optional(),
  bankAccountCode: z.string().optional(),
  autoApprovalEnabled: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    let settings = await db.query.payrollSettings.findFirst({
      where: eq(payrollSettings.organizationId, ctx.organizationId),
    });

    if (!settings) {
      const [created] = await db
        .insert(payrollSettings)
        .values({ organizationId: ctx.organizationId })
        .returning();
      settings = created;
    }

    return ok({ settings });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    let settings = await db.query.payrollSettings.findFirst({
      where: eq(payrollSettings.organizationId, ctx.organizationId),
    });

    if (!settings) {
      const [created] = await db
        .insert(payrollSettings)
        .values({ organizationId: ctx.organizationId, ...parsed })
        .returning();
      settings = created;
    } else {
      const [updated] = await db
        .update(payrollSettings)
        .set({ ...parsed, updatedAt: new Date() })
        .where(eq(payrollSettings.organizationId, ctx.organizationId))
        .returning();
      settings = updated;
    }

    logAudit({ ctx, action: "update", entityType: "payrollSettings", entityId: settings.id, changes: parsed, request });

    return ok({ settings });
  } catch (err) {
    return handleError(err);
  }
}

import { db } from "@/lib/db";
import { payrollSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { resolvePayrollSettings } from "@/lib/api/payroll-withholding";
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
  // Payroll tax parameters: rates in basis points (620 = 6.2%), wage bases and
  // thresholds in integer cents per year.
  ssWageBaseCents: z.number().int().min(0).optional(),
  ssRateBp: z.number().int().min(0).max(10000).optional(),
  medicareRateBp: z.number().int().min(0).max(10000).optional(),
  addlMedicareThresholdCents: z.number().int().min(0).optional(),
  addlMedicareRateBp: z.number().int().min(0).max(10000).optional(),
  employerFicaEnabled: z.boolean().optional(),
  futaRateBp: z.number().int().min(0).max(10000).optional(),
  futaWageBaseCents: z.number().int().min(0).optional(),
  sutaRateBp: z.number().int().min(0).max(10000).optional(),
  sutaWageBaseCents: z.number().int().min(0).optional(),
  defaultTaxYear: z.number().int().min(2000).max(2100).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const settings = await resolvePayrollSettings(ctx.organizationId);

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

import { db } from "@/lib/db";
import {
  taxFormGeneration,
  taxForm,
  contractorPayment,
  contractor,
  payrollItem,
  payrollItemTaxBreakdown,
  payrollItemDeduction,
  deductionType,
  payrollRun,
  payrollEmployee,
  payrollSettings,
  member,
} from "@/lib/db/schema";
import { eq, and, sql, gte, lt, lte, inArray } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { AuthError, type AuthContext } from "@/lib/api/auth-context";
import { buildW2Boxes, type W2ItemInput } from "@/lib/tax-forms/w2";

export type TaxFormType = "1099_nec" | "1099_misc" | "w2";

/** 1099-NEC is required once a contractor is paid at least $600 in the year. */
const NEC_THRESHOLD_CENTS = 60000;
/** 2026 Social Security wage base, used when the org has no payroll settings yet. */
const DEFAULT_SS_WAGE_BASE_CENTS = 16810000;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type FormInsert = Omit<typeof taxForm.$inferInsert, "generationId">;

/** Contractors paid at least $600 of "paid" payments during the year. */
async function build1099NecForms(ctx: AuthContext, taxYear: number): Promise<FormInsert[]> {
  const yearStart = new Date(`${taxYear}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${taxYear + 1}-01-01T00:00:00.000Z`);
  const totals = await db
    .select({
      contractorId: contractorPayment.contractorId,
      totalAmount: sql<number>`COALESCE(SUM(${contractorPayment.amount}), 0)`.mapWith(Number),
    })
    .from(contractorPayment)
    .innerJoin(contractor, eq(contractorPayment.contractorId, contractor.id))
    .where(and(
      eq(contractor.organizationId, ctx.organizationId),
      eq(contractorPayment.status, "paid"),
      gte(contractorPayment.paidAt, yearStart),
      lt(contractorPayment.paidAt, yearEnd)
    ))
    .groupBy(contractorPayment.contractorId);

  const due = totals.filter((t) => t.totalAmount >= NEC_THRESHOLD_CENTS);
  if (due.length === 0) return [];
  const contractors = await db.query.contractor.findMany({
    where: and(
      eq(contractor.organizationId, ctx.organizationId),
      inArray(contractor.id, due.map((t) => t.contractorId))
    ),
  });
  const byId = new Map(contractors.map((c) => [c.id, c]));

  return due.flatMap((t) => {
    const c = byId.get(t.contractorId);
    if (!c) return [];
    return [{
      recipientType: "contractor",
      recipientId: c.id,
      recipientName: c.name,
      recipientTaxId: c.taxId,
      formType: "1099_nec" as const,
      taxYear,
      formData: {
        box1_nonemployee_compensation: t.totalAmount,
        recipient_company: c.company,
        recipient_email: c.email,
      },
      status: "generated" as const,
    }];
  });
}

/**
 * One W-2 per employee paid in the year. A run belongs to the year its pay
 * period ends in; only completed runs count (void and deleted runs are left out).
 */
async function buildW2Forms(ctx: AuthContext, taxYear: number): Promise<FormInsert[]> {
  const settings = await db.query.payrollSettings.findFirst({
    where: eq(payrollSettings.organizationId, ctx.organizationId),
  });
  const ssWageBaseCents = settings?.ssWageBaseCents ?? DEFAULT_SS_WAGE_BASE_CENTS;

  const runInYear = and(
    eq(payrollRun.organizationId, ctx.organizationId),
    eq(payrollRun.status, "completed"),
    notDeleted(payrollRun.deletedAt),
    gte(payrollRun.payPeriodEnd, `${taxYear}-01-01`),
    lte(payrollRun.payPeriodEnd, `${taxYear}-12-31`)
  );

  const items = await db
    .select({
      id: payrollItem.id,
      employeeId: payrollItem.employeeId,
      grossAmount: payrollItem.grossAmount,
      taxAmount: payrollItem.taxAmount,
      preTaxDeductions: payrollItem.preTaxDeductions,
    })
    .from(payrollItem)
    .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
    .where(runInYear);
  if (items.length === 0) return [];

  const taxRows = await db
    .select({
      payrollItemId: payrollItemTaxBreakdown.payrollItemId,
      taxKind: payrollItemTaxBreakdown.taxKind,
      jurisdictionLevel: payrollItemTaxBreakdown.jurisdictionLevel,
      jurisdiction: payrollItemTaxBreakdown.jurisdiction,
      amount: payrollItemTaxBreakdown.amount,
    })
    .from(payrollItemTaxBreakdown)
    .innerJoin(payrollItem, eq(payrollItemTaxBreakdown.payrollItemId, payrollItem.id))
    .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
    .where(runInYear);

  const deductionRows = await db
    .select({
      payrollItemId: payrollItemDeduction.payrollItemId,
      name: deductionType.name,
      category: payrollItemDeduction.category,
      amount: payrollItemDeduction.amount,
    })
    .from(payrollItemDeduction)
    .innerJoin(deductionType, eq(payrollItemDeduction.deductionTypeId, deductionType.id))
    .innerJoin(payrollItem, eq(payrollItemDeduction.payrollItemId, payrollItem.id))
    .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
    .where(runInYear);

  const inputs = new Map<string, W2ItemInput>();
  const itemsByEmployee = new Map<string, W2ItemInput[]>();
  for (const it of items) {
    const input: W2ItemInput = {
      grossAmount: it.grossAmount,
      taxAmount: it.taxAmount,
      preTaxDeductions: it.preTaxDeductions ?? 0,
      deductions: [],
      taxes: [],
    };
    inputs.set(it.id, input);
    const list = itemsByEmployee.get(it.employeeId) ?? [];
    list.push(input);
    itemsByEmployee.set(it.employeeId, list);
  }
  for (const t of taxRows) inputs.get(t.payrollItemId)?.taxes.push(t);
  for (const d of deductionRows) inputs.get(d.payrollItemId)?.deductions.push(d);

  // Employees deleted since are still owed their W-2
  const employees = await db.query.payrollEmployee.findMany({
    where: and(
      eq(payrollEmployee.organizationId, ctx.organizationId),
      inArray(payrollEmployee.id, [...itemsByEmployee.keys()])
    ),
  });

  return employees.map((emp) => ({
    recipientType: "employee",
    recipientId: emp.id,
    recipientName: emp.name,
    // Employees have no SSN field yet, so the W-2 recipient tax ID stays empty
    recipientTaxId: null,
    formType: "w2" as const,
    taxYear,
    formData: {
      ...buildW2Boxes(itemsByEmployee.get(emp.id) ?? [], { ssWageBaseCents }),
      employee_email: emp.email,
      employee_number: emp.employeeNumber,
    },
    status: "generated" as const,
  }));
}

/**
 * Generates a batch of year-end forms. Generating the same form type for the
 * same year again replaces the previous batch (it is soft-deleted), unless that
 * batch was already sent or filed.
 */
export async function generateTaxForms(ctx: AuthContext, input: { taxYear: number; formType: TaxFormType }) {
  if (input.formType === "1099_misc") {
    throw new AuthError("1099-MISC forms can't be generated yet. Use 1099-NEC for contractor payments.", 422);
  }

  const forms = input.formType === "w2"
    ? await buildW2Forms(ctx, input.taxYear)
    : await build1099NecForms(ctx, input.taxYear);

  const mem = await db.query.member.findFirst({
    where: and(eq(member.organizationId, ctx.organizationId), eq(member.userId, ctx.userId)),
  });

  return db.transaction(async (tx: Tx) => {
    const sameBatch = and(
      eq(taxFormGeneration.organizationId, ctx.organizationId),
      eq(taxFormGeneration.taxYear, input.taxYear),
      eq(taxFormGeneration.formType, input.formType),
      notDeleted(taxFormGeneration.deletedAt)
    );
    const previous = await tx.select().from(taxFormGeneration).where(sameBatch);
    if (previous.some((g) => g.status === "sent" || g.status === "filed")) {
      throw new AuthError("These forms were already sent or filed for this year, so they can't be regenerated.", 409);
    }
    if (previous.length > 0) {
      await tx.update(taxFormGeneration).set({ deletedAt: new Date() }).where(sameBatch);
    }

    const [generation] = await tx
      .insert(taxFormGeneration)
      .values({
        organizationId: ctx.organizationId,
        taxYear: input.taxYear,
        formType: input.formType,
        status: "generated",
        generatedAt: new Date(),
        createdBy: mem?.id ?? null,
      })
      .returning();

    if (forms.length > 0) {
      await tx.insert(taxForm).values(forms.map((f) => ({ ...f, generationId: generation.id })));
    }

    return { generation, formsGenerated: forms.length, replacedPrevious: previous.length > 0 };
  });
}

/**
 * Loads one tax form of this org (its batch must not be deleted), or throws a
 * 404. Forms of other organizations are reported as not found.
 */
export async function getTaxFormForOrg(ctx: AuthContext, formId: string) {
  const form = await db.query.taxForm.findFirst({
    where: eq(taxForm.id, formId),
    with: { generation: true },
  });
  if (!form || form.generation?.organizationId !== ctx.organizationId || form.generation.deletedAt) {
    throw new AuthError("Tax form not found", 404);
  }
  return form;
}

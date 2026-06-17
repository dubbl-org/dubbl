import { NextResponse } from "next/server";
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
import { eq, and, sql, gte, lt, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const generateSchema = z.object({
  taxYear: z.number().int().min(2020).max(2099),
  formType: z.enum(["1099_nec", "1099_misc", "w2"]),
});

// Group the per-jurisdiction tax-breakdown rows that drive a W-2 by the kind of
// tax they represent. The withholding engine writes these exact taxKind values
// (see lib/api/payroll-withholding.ts): "income_tax", "social_security",
// "medicare", "additional_medicare". Anything else (state, local) is bucketed
// into the box14 "other" total so it is never silently dropped.
function classifyW2TaxKind(
  taxKind: string,
  jurisdictionLevel: string
):
  | "federal_income_tax"
  | "social_security_tax"
  | "medicare_tax"
  | "state_income_tax"
  | "local_income_tax"
  | "other" {
  const k = taxKind.toLowerCase();
  if (k === "social_security" || k.includes("social_security")) return "social_security_tax";
  // Additional Medicare (0.9%) is still box 6 Medicare tax withheld.
  if (k === "medicare" || k === "additional_medicare" || k.includes("medicare")) return "medicare_tax";
  if (k === "income_tax" || k.includes("income_tax") || k.includes("withholding")) {
    if (jurisdictionLevel === "state") return "state_income_tax";
    if (jurisdictionLevel === "local") return "local_income_tax";
    return "federal_income_tax";
  }
  return "other";
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");
    const body = await request.json();
    const parsed = generateSchema.parse(body);

    const mem = await db.query.member.findFirst({
      where: and(eq(member.organizationId, ctx.organizationId), eq(member.userId, ctx.userId)),
    });

    const [generation] = await db.insert(taxFormGeneration).values({
      organizationId: ctx.organizationId,
      taxYear: parsed.taxYear,
      formType: parsed.formType,
      status: "draft",
      createdBy: mem?.id || null,
    }).returning();

    const yearStart = `${parsed.taxYear}-01-01`;
    const yearEnd = `${parsed.taxYear + 1}-01-01`;
    const forms = [];

    if (parsed.formType === "1099_nec") {
      const contractorTotals = await db
        .select({
          contractorId: contractorPayment.contractorId,
          totalAmount: sql<number>`COALESCE(SUM(${contractorPayment.amount}), 0)`.mapWith(Number),
        })
        .from(contractorPayment)
        .innerJoin(contractor, eq(contractorPayment.contractorId, contractor.id))
        .where(and(
          eq(contractor.organizationId, ctx.organizationId),
          eq(contractorPayment.status, "paid"),
          gte(contractorPayment.paidAt, new Date(yearStart)),
          lt(contractorPayment.paidAt, new Date(yearEnd))
        ))
        .groupBy(contractorPayment.contractorId);

      for (const ct of contractorTotals) {
        if (ct.totalAmount < 60000) continue;
        const c = await db.query.contractor.findFirst({ where: eq(contractor.id, ct.contractorId) });
        if (!c) continue;

        const [form] = await db.insert(taxForm).values({
          generationId: generation.id,
          recipientType: "contractor",
          recipientId: c.id,
          recipientName: c.name,
          recipientTaxId: c.taxId,
          formType: "1099_nec",
          taxYear: parsed.taxYear,
          formData: { box1_nonemployee_compensation: ct.totalAmount, recipient_company: c.company, recipient_email: c.email },
          status: "generated",
        }).returning();
        forms.push(form);
      }
    } else if (parsed.formType === "w2") {
      // The org's SS wage base caps box 3 (Social Security wages). Fall back to
      // the 2026 statutory default when no settings row exists.
      const settings = await db.query.payrollSettings.findFirst({
        where: eq(payrollSettings.organizationId, ctx.organizationId),
      });
      const ssWageBase = settings?.ssWageBaseCents ?? 16810000;

      // Per-employee wage totals from this tax year's COMPLETED runs. We compute
      // gross and pre-tax deductions separately so box 1 (taxable federal wages)
      // = gross − pre-tax, while box 3/5 (SS/Medicare wages) = full gross
      // (pre-tax 401(k) etc. are still subject to FICA).
      const employeeTotals = await db
        .select({
          employeeId: payrollItem.employeeId,
          totalGross: sql<number>`COALESCE(SUM(${payrollItem.grossAmount}), 0)`.mapWith(Number),
          totalPreTax: sql<number>`COALESCE(SUM(${payrollItem.preTaxDeductions}), 0)`.mapWith(Number),
        })
        .from(payrollItem)
        .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
        .where(and(
          eq(payrollRun.organizationId, ctx.organizationId),
          eq(payrollRun.status, "completed"),
          gte(payrollRun.payPeriodStart, yearStart),
          lt(payrollRun.payPeriodEnd, yearEnd)
        ))
        .groupBy(payrollItem.employeeId);

      // Per-employee tax withheld, summed from the per-jurisdiction breakdown
      // rows (the source of truth the engine populates) rather than the lumped
      // payrollItem.taxAmount, so FIT / SS / Medicare / state land in the right
      // W-2 boxes.
      const taxRows = await db
        .select({
          employeeId: payrollItem.employeeId,
          jurisdictionLevel: payrollItemTaxBreakdown.jurisdictionLevel,
          taxKind: payrollItemTaxBreakdown.taxKind,
          amount: sql<number>`COALESCE(SUM(${payrollItemTaxBreakdown.amount}), 0)`.mapWith(Number),
        })
        .from(payrollItemTaxBreakdown)
        .innerJoin(payrollItem, eq(payrollItemTaxBreakdown.payrollItemId, payrollItem.id))
        .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
        .where(and(
          eq(payrollRun.organizationId, ctx.organizationId),
          eq(payrollRun.status, "completed"),
          gte(payrollRun.payPeriodStart, yearStart),
          lt(payrollRun.payPeriodEnd, yearEnd)
        ))
        .groupBy(payrollItem.employeeId, payrollItemTaxBreakdown.jurisdictionLevel, payrollItemTaxBreakdown.taxKind);

      // Per-employee pre-tax (box 12) vs other (box 14) deduction totals, split
      // by deduction category. pre_tax deductions (401k/retirement/HSA/benefits)
      // are reported in box 12; post-tax statutory items roll up into box 14.
      const deductionRows = await db
        .select({
          employeeId: payrollItem.employeeId,
          category: payrollItemDeduction.category,
          name: deductionType.name,
          amount: sql<number>`COALESCE(SUM(${payrollItemDeduction.amount}), 0)`.mapWith(Number),
        })
        .from(payrollItemDeduction)
        .innerJoin(payrollItem, eq(payrollItemDeduction.payrollItemId, payrollItem.id))
        .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
        .innerJoin(deductionType, eq(payrollItemDeduction.deductionTypeId, deductionType.id))
        .where(and(
          eq(payrollRun.organizationId, ctx.organizationId),
          eq(payrollRun.status, "completed"),
          gte(payrollRun.payPeriodStart, yearStart),
          lt(payrollRun.payPeriodEnd, yearEnd)
        ))
        .groupBy(payrollItem.employeeId, payrollItemDeduction.category, deductionType.name);

      // Index tax + deduction rows by employee for O(1) lookup per employee.
      const taxByEmployee = new Map<string, typeof taxRows>();
      for (const r of taxRows) {
        const list = taxByEmployee.get(r.employeeId) ?? [];
        list.push(r);
        taxByEmployee.set(r.employeeId, list);
      }
      const deductionsByEmployee = new Map<string, typeof deductionRows>();
      for (const r of deductionRows) {
        const list = deductionsByEmployee.get(r.employeeId) ?? [];
        list.push(r);
        deductionsByEmployee.set(r.employeeId, list);
      }

      // Pull every employee referenced by the wage totals in one query.
      const employeeIds = employeeTotals.map((e) => e.employeeId);
      const employees = employeeIds.length
        ? await db.query.payrollEmployee.findMany({
            where: and(
              eq(payrollEmployee.organizationId, ctx.organizationId),
              inArray(payrollEmployee.id, employeeIds)
            ),
            with: { taxConfig: true },
          })
        : [];
      const employeeById = new Map(employees.map((e) => [e.id, e]));

      for (const et of employeeTotals) {
        const emp = employeeById.get(et.employeeId);
        if (!emp) continue;

        // box 1: federal taxable wages = gross − pre-tax deductions.
        const box1Wages = Math.max(0, et.totalGross - et.totalPreTax);

        // Tax withheld by W-2 bucket from the breakdown rows.
        let box2FederalTax = 0;
        let box4SsTax = 0;
        let box6MedicareTax = 0;
        let stateIncomeTax = 0;
        let localIncomeTax = 0;
        let box14OtherTax = 0;
        for (const tr of taxByEmployee.get(et.employeeId) ?? []) {
          const bucket = classifyW2TaxKind(tr.taxKind, tr.jurisdictionLevel);
          switch (bucket) {
            case "federal_income_tax": box2FederalTax += tr.amount; break;
            case "social_security_tax": box4SsTax += tr.amount; break;
            case "medicare_tax": box6MedicareTax += tr.amount; break;
            case "state_income_tax": stateIncomeTax += tr.amount; break;
            case "local_income_tax": localIncomeTax += tr.amount; break;
            default: box14OtherTax += tr.amount; break;
          }
        }

        // box 3: Social Security wages, capped at the annual SS wage base. box 5:
        // Medicare wages (no cap). Both use full gross — pre-tax 401(k)/etc. are
        // still FICA-taxable.
        const box3SsWages = Math.min(et.totalGross, ssWageBase);
        const box5MedicareWages = et.totalGross;

        // box 12 (retirement/benefit elective deferrals) vs box 14 (other).
        let box12Retirement = 0;
        let box14OtherDeductions = 0;
        for (const dr of deductionsByEmployee.get(et.employeeId) ?? []) {
          if (dr.category === "pre_tax") box12Retirement += dr.amount;
          else box14OtherDeductions += dr.amount;
        }

        const [form] = await db.insert(taxForm).values({
          generationId: generation.id,
          recipientType: "employee",
          recipientId: emp.id,
          recipientName: emp.name,
          recipientTaxId: null,
          formType: "w2",
          taxYear: parsed.taxYear,
          formData: {
            box1_wages: box1Wages,
            box2_federal_tax: box2FederalTax,
            box3_ss_wages: box3SsWages,
            box4_ss_tax: box4SsTax,
            box5_medicare_wages: box5MedicareWages,
            box6_medicare_tax: box6MedicareTax,
            // box 12: elective deferrals / retirement plan contributions (cents).
            // Code D (401(k)) is the common case; reported as a single total here.
            box12_retirement_deferrals: box12Retirement,
            box13_retirement_plan: box12Retirement > 0,
            // box 14: other amounts (post-tax deductions + any non-standard taxes).
            box14_other: box14OtherDeductions + box14OtherTax,
            // State / local boxes 15-19.
            box17_state_income_tax: stateIncomeTax,
            box19_local_income_tax: localIncomeTax,
            employee_email: emp.email,
            employee_number: emp.employeeNumber,
          },
          status: "generated",
        }).returning();
        forms.push(form);
      }
    }

    await db.update(taxFormGeneration).set({ status: "generated", generatedAt: new Date() }).where(eq(taxFormGeneration.id, generation.id));

    logAudit({ ctx, action: "generate", entityType: "taxFormGeneration", entityId: generation.id, request });

    return NextResponse.json({ generation: { ...generation, status: "generated" }, formsGenerated: forms.length }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

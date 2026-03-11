import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxFormGeneration, taxForm, contractorPayment, contractor, payrollItem, payrollRun, payrollEmployee, member } from "@/lib/db/schema";
import { eq, and, sql, gte, lt } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { z } from "zod";

const generateSchema = z.object({
  taxYear: z.number().int().min(2020).max(2099),
  formType: z.enum(["1099_nec", "1099_misc", "w2"]),
});

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
      const employeeTotals = await db
        .select({
          employeeId: payrollItem.employeeId,
          totalGross: sql<number>`COALESCE(SUM(${payrollItem.grossAmount}), 0)`.mapWith(Number),
          totalTax: sql<number>`COALESCE(SUM(${payrollItem.taxAmount}), 0)`.mapWith(Number),
          totalNet: sql<number>`COALESCE(SUM(${payrollItem.netAmount}), 0)`.mapWith(Number),
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

      for (const et of employeeTotals) {
        const emp = await db.query.payrollEmployee.findFirst({ where: eq(payrollEmployee.id, et.employeeId) });
        if (!emp) continue;

        const [form] = await db.insert(taxForm).values({
          generationId: generation.id,
          recipientType: "employee",
          recipientId: emp.id,
          recipientName: emp.name,
          recipientTaxId: null,
          formType: "w2",
          taxYear: parsed.taxYear,
          formData: {
            box1_wages: et.totalGross,
            box2_federal_tax: et.totalTax,
            box3_ss_wages: et.totalGross,
            box4_ss_tax: Math.round(et.totalGross * 0.062),
            box5_medicare_wages: et.totalGross,
            box6_medicare_tax: Math.round(et.totalGross * 0.0145),
            employee_email: emp.email,
            employee_number: emp.employeeNumber,
          },
          status: "generated",
        }).returning();
        forms.push(form);
      }
    }

    await db.update(taxFormGeneration).set({ status: "generated", generatedAt: new Date() }).where(eq(taxFormGeneration.id, generation.id));

    return NextResponse.json({ generation: { ...generation, status: "generated" }, formsGenerated: forms.length }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

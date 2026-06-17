import { db } from "@/lib/db";
import {
  payrollRun,
  payrollItem,
  payrollItemTaxBreakdown,
  payrollItemEmployerTax,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, created, notFound, validationError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { postPayrollRun } from "@/lib/api/payroll-posting";
import {
  type TaxBreakdownLine,
  type EmployerTaxLine,
} from "@/lib/api/payroll-withholding";
import { z } from "zod";

const correctionSchema = z.object({
  parentRunId: z.string().uuid(),
  notes: z.string().optional(),
  adjustments: z.array(z.object({
    employeeId: z.string().uuid(),
    grossAdjustment: z.number().int(), // can be negative
    description: z.string().optional(),
  })).min(1),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");

    const body = await request.json();
    const parsed = correctionSchema.parse(body);

    const parentRun = await db.query.payrollRun.findFirst({
      where: and(
        eq(payrollRun.id, parsed.parentRunId),
        eq(payrollRun.organizationId, ctx.organizationId),
        notDeleted(payrollRun.deletedAt)
      ),
      with: { items: true },
    });

    if (!parentRun) return notFound("Parent payroll run");
    if (parentRun.status !== "completed") return validationError("Can only correct completed runs");

    // Aggregate the PARENT run's actual per-employee gross + withholding split so
    // a correction reverses (or adds to) the SAME proportional mix of income tax
    // / FICA / pension / employer taxes the parent posted — rather than dumping a
    // flat tax to income-tax payable. The persisted correction breakdown then
    // matches the journal split postPayrollRun derives from the parent.
    const parentItemIds = parentRun.items.map((i) => i.id);
    const parentTaxRows = parentItemIds.length
      ? await db.query.payrollItemTaxBreakdown.findMany({
          where: inArray(payrollItemTaxBreakdown.payrollItemId, parentItemIds),
        })
      : [];
    const parentEmployerRows = parentItemIds.length
      ? await db.query.payrollItemEmployerTax.findMany({
          where: inArray(payrollItemEmployerTax.payrollItemId, parentItemIds),
        })
      : [];

    interface ParentAgg {
      gross: number; // local-currency cents (parent)
      currency: string;
      fxRate: number;
      breakdown: TaxBreakdownLine[];
      employerBreakdown: EmployerTaxLine[];
    }
    const parentByEmp = new Map<string, ParentAgg>();
    const itemEmp = new Map<string, string>(); // parent itemId → employeeId
    for (const it of parentRun.items) {
      itemEmp.set(it.id, it.employeeId);
      const agg = parentByEmp.get(it.employeeId) ?? {
        gross: 0,
        currency: it.currency ?? "USD",
        fxRate: it.fxRate ?? 1,
        breakdown: [],
        employerBreakdown: [],
      };
      agg.gross += it.grossAmount;
      parentByEmp.set(it.employeeId, agg);
    }
    for (const tb of parentTaxRows) {
      const empId = itemEmp.get(tb.payrollItemId);
      const agg = empId ? parentByEmp.get(empId) : undefined;
      if (agg)
        agg.breakdown.push({
          jurisdictionLevel: tb.jurisdictionLevel,
          jurisdiction: tb.jurisdiction,
          taxKind: tb.taxKind,
          amount: tb.amount,
        });
    }
    for (const et of parentEmployerRows) {
      const empId = itemEmp.get(et.payrollItemId);
      const agg = empId ? parentByEmp.get(empId) : undefined;
      if (agg)
        agg.employerBreakdown.push({
          jurisdictionLevel: et.jurisdictionLevel,
          jurisdiction: et.jurisdiction,
          taxKind: et.taxKind,
          amount: et.amount,
        });
    }

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    // Each item carries the breakdown rows it should persist (aligned by index).
    const items: Array<
      typeof payrollItem.$inferInsert & {
        taxBreakdown: TaxBreakdownLine[];
        employerTaxBreakdown: EmployerTaxLine[];
      }
    > = [];

    for (const adj of parsed.adjustments) {
      const parentAgg = parentByEmp.get(adj.employeeId);

      // Scale the parent's per-bucket split by this adjustment's proportion of
      // the parent's gross for the same employee (signed: a negative adjustment
      // produces negative breakdown amounts that reverse the parent's credits).
      let taxBreakdown: TaxBreakdownLine[] = [];
      let employerTaxBreakdown: EmployerTaxLine[] = [];
      let taxAmount = 0;
      // Match the parent's currency so postPayrollRun converts consistently.
      let currency = "USD";
      let fxRate = 1;

      if (parentAgg && parentAgg.gross !== 0) {
        const ratio = adj.grossAdjustment / parentAgg.gross;
        currency = parentAgg.currency;
        fxRate = parentAgg.fxRate;
        taxBreakdown = parentAgg.breakdown
          .map((line) => ({ ...line, amount: Math.round(line.amount * ratio) }))
          .filter((line) => line.amount !== 0);
        employerTaxBreakdown = parentAgg.employerBreakdown
          .map((line) => ({ ...line, amount: Math.round(line.amount * ratio) }))
          .filter((line) => line.amount !== 0);
        taxAmount = taxBreakdown.reduce((s, l) => s + l.amount, 0);
      }

      const netAmount = adj.grossAdjustment - taxAmount;

      totalGross += adj.grossAdjustment;
      totalDeductions += taxAmount;
      totalNet += netAmount;

      items.push({
        payrollRunId: "",
        employeeId: adj.employeeId,
        type: adj.grossAdjustment >= 0 ? "regular_salary" : "deduction",
        description: adj.description || "Correction adjustment",
        grossAmount: adj.grossAdjustment,
        taxAmount,
        deductions: taxAmount,
        netAmount,
        currency,
        fxRate,
        taxBreakdown,
        employerTaxBreakdown,
      });
    }

    // Create the correction run + items, post its adjusting journal entry, and
    // complete it atomically. The posting helper books the SIGNED deltas (a
    // negative adjustment self-reverses into the opposite debit/credit column),
    // crediting withholdings to the proper liability accounts — never the VAT
    // account — by reversing the parent's per-bucket split in the same proportion
    // (via parentRunId), so the parent's FICA/pension/income-tax liabilities net
    // back correctly.
    const run = await db.transaction(async (tx) => {
      const [createdRun] = await tx
        .insert(payrollRun)
        .values({
          organizationId: ctx.organizationId,
          payPeriodStart: parentRun.payPeriodStart,
          payPeriodEnd: parentRun.payPeriodEnd,
          runType: "correction",
          parentRunId: parsed.parentRunId,
          notes: parsed.notes || `Correction for run ${parsed.parentRunId.slice(0, 8)}`,
          totalGross,
          totalDeductions,
          totalNet,
        })
        .returning();

      // Insert items (stripping breakdown fields) and capture ids so we can
      // attach the proportionally-scaled per-jurisdiction breakdown rows.
      const insertedItems = await tx
        .insert(payrollItem)
        .values(
          items.map((item) => {
            const { taxBreakdown, employerTaxBreakdown, ...columns } = item;
            void taxBreakdown;
            void employerTaxBreakdown;
            return { ...columns, payrollRunId: createdRun.id };
          })
        )
        .returning({ id: payrollItem.id });

      const taxRows: (typeof payrollItemTaxBreakdown.$inferInsert)[] = [];
      const employerRows: (typeof payrollItemEmployerTax.$inferInsert)[] = [];
      items.forEach((item, idx) => {
        const payrollItemId = insertedItems[idx].id;
        for (const line of item.taxBreakdown) {
          taxRows.push({ payrollItemId, ...line });
        }
        for (const line of item.employerTaxBreakdown) {
          employerRows.push({ payrollItemId, ...line });
        }
      });
      if (taxRows.length > 0)
        await tx.insert(payrollItemTaxBreakdown).values(taxRows);
      if (employerRows.length > 0)
        await tx.insert(payrollItemEmployerTax).values(employerRows);

      const journalEntryId = await postPayrollRun(
        { organizationId: ctx.organizationId, userId: ctx.userId },
        createdRun.id,
        tx
      );

      const [completed] = await tx
        .update(payrollRun)
        .set({ status: "completed", processedAt: new Date() })
        .where(eq(payrollRun.id, createdRun.id))
        .returning();

      return { ...completed, journalEntryId };
    });

    logAudit({ ctx, action: "create_correction_run", entityType: "payrollRun", entityId: run.id, request });

    return created({ run });
  } catch (err) {
    return handleError(err);
  }
}

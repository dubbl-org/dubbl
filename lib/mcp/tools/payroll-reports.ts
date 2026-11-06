import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { taxFormGeneration } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";
import {
  getPayrollSummary,
  getTaxLiabilityReport,
  getLaborCostReport,
  getYoyReport,
} from "@/lib/api/payroll-reports";
import { getPayrollTaxLiabilities } from "@/lib/api/payroll-tax-liabilities";
import { getTaxFormForOrg } from "@/lib/api/tax-form-builder";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeShape = {
  startDate: dateSchema.optional().describe("Only runs whose pay date (end of pay period) is on or after this date, YYYY-MM-DD"),
  endDate: dateSchema.optional().describe("Only runs whose pay date (end of pay period) is on or before this date, YYYY-MM-DD"),
};
const RANGE_NOTE =
  "Only finished payroll runs count (void/cancelled and deleted runs are excluded); runs are filtered by pay date.";

export function registerPayrollReportTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "get_payroll_summary_report",
    `Payroll totals for a date range. ${RANGE_NOTE} Returns totalRuns, totalGross, totalTax (employee tax withheld), totalOtherDeductions (deductions other than tax), totalDeductions (tax + other), totalNet, employerTaxes, avgCostPerRun and activeEmployees. Amounts are integer cents in the base currency.`,
    rangeShape,
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:payroll-reports");
        return { summary: await getPayrollSummary(ctx, params) };
      })
  );

  server.tool(
    "get_payroll_tax_report",
    `Tax per employee for a date range. ${RANGE_NOTE} Each row has employeeId, employeeName, totalGross, totalTax (employee withholding) and employerTax; also returns totalTax and totalEmployerTax. Integer cents, base currency.`,
    rangeShape,
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:payroll-reports");
        return getTaxLiabilityReport(ctx, params);
      })
  );

  server.tool(
    "get_payroll_labor_cost_report",
    `Labor cost by department for a date range. ${RANGE_NOTE} Each row has department ('Unassigned' when empty), employeeCount, totalGross and totalNet in integer cents (base currency).`,
    rangeShape,
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:payroll-reports");
        return getLaborCostReport(ctx, params);
      })
  );

  server.tool(
    "get_payroll_yoy_report",
    `Month-by-month payroll for a date range, each month compared with the same month a year earlier. ${RANGE_NOTE} Each row has month (YYYY-MM), runCount, totalGross, totalNet, priorYearGross, priorYearNet and changePercent (gross change in percent, null when last year had nothing). Integer cents, base currency.`,
    rangeShape,
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:payroll-reports");
        return getYoyReport(ctx, params);
      })
  );

  server.tool(
    "get_payroll_tax_liabilities",
    "What the organization owes on payroll taxes, all time. For each bucket (income_tax: income tax withheld; fica: Social Security, Medicare, FUTA and SUTA, employee and employer share; pension: pension & benefit deductions) returns accountCode, owed (credited to the liability account by finished, non-void pay runs), paid (cleared by recorded tax payments) and outstanding (owed minus paid, not below 0), plus overall totals. Integer cents in the base currency. Use record_payroll_tax_remittance to record a payment.",
    {},
    () =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        return getPayrollTaxLiabilities(ctx);
      })
  );

  server.tool(
    "list_tax_forms",
    "List generated year-end tax form batches (W-2, 1099-NEC), newest first, with their forms. Each form has id, recipientName, recipientType, masked recipientTaxId (last 4 digits), formType, taxYear, status and formData (box amounts in integer cents). Use get_tax_form for one form with the full tax ID.",
    {
      taxYear: z.number().int().min(2020).max(2099).optional().describe("Only batches for this tax year"),
      formType: z.enum(["1099_nec", "1099_misc", "w2"]).optional().describe("Only batches of this form type"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const conditions = [
          eq(taxFormGeneration.organizationId, ctx.organizationId),
          notDeleted(taxFormGeneration.deletedAt),
        ];
        if (params.taxYear) conditions.push(eq(taxFormGeneration.taxYear, params.taxYear));
        if (params.formType) conditions.push(eq(taxFormGeneration.formType, params.formType));
        const generations = await db.query.taxFormGeneration.findMany({
          where: and(...conditions),
          orderBy: desc(taxFormGeneration.createdAt),
          with: { forms: true },
        });
        return {
          generations: generations.map((g) => ({
            ...g,
            forms: g.forms.map((f) => ({
              ...f,
              recipientTaxId: f.recipientTaxId ? `***${f.recipientTaxId.slice(-4)}` : null,
            })),
          })),
        };
      })
  );

  server.tool(
    "get_tax_form",
    "Get one year-end tax form by id with all its boxes (formData, amounts in integer cents). W-2 formData: box1_wages, box2_federal_tax, box3_ss_wages, box4_ss_tax, box5_medicare_wages, box6_medicare_tax, box12 [{code, amount, description}], box13_retirement_plan, box14 [{label, amount}], states [{state, wages, tax}] (boxes 15-17), localities [{locality, wages, tax}] (boxes 18-20). 1099-NEC formData: box1_nonemployee_compensation.",
    {
      formId: z.string().uuid().describe("Tax form id (from list_tax_forms)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        return { form: await getTaxFormForOrg(ctx, params.formId) };
      })
  );
}

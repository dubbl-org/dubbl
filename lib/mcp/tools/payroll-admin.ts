import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  approvalChain,
  approvalChainStep,
  compensationBand,
  contractor,
  contractorPayment,
  deductionType,
  employeeDeduction,
  employeeTaxConfig,
  payrollEmployee,
  payrollSettings,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { logAudit } from "@/lib/api/audit";
import { wrapTool } from "@/lib/mcp/errors";
import { ApprovalError } from "@/lib/approvals/errors";
import { currencyCodeSchema } from "@/lib/currency/zod";
import {
  addBonusToRun,
  approveRun,
  approversInOrg,
  deleteDraftPayrollRun,
  rejectRun,
  removeBonusFromRun,
  submitRunForApproval,
  voidPayrollRun,
} from "@/lib/api/payroll-run-actions";
import {
  createBonusOnlyRun,
  createCorrectionRun,
  createFinalPayRun,
} from "@/lib/api/payroll-offcycle";
import { emailRunPayslips } from "@/lib/api/payslips";
import { processContractorPayment } from "@/lib/api/contractor-payments";
import { resolvePayrollSettings } from "@/lib/api/payroll-withholding";
import type { AuthContext } from "@/lib/api/auth-context";

const BONUS_TYPES = ["performance", "signing", "referral", "holiday", "spot", "retention", "other"] as const;
const FILING_STATUSES = ["single", "married_joint", "married_separate", "head_of_household"] as const;
const chainStepsSchema = z
  .array(
    z.object({
      stepOrder: z.number().int().min(1).describe("Position of this approver in the chain, starting at 1"),
      approverId: z.string().uuid().describe("Workspace member UUID (from list_workspace_members) who signs off at this step"),
    })
  )
  .describe("Approvers in order. Every approver must be a member of this workspace.");

async function findEmployee(organizationId: string, employeeId: string) {
  const emp = await db.query.payrollEmployee.findFirst({
    where: and(
      eq(payrollEmployee.id, employeeId),
      eq(payrollEmployee.organizationId, organizationId),
      notDeleted(payrollEmployee.deletedAt)
    ),
  });
  if (!emp) throw new ApprovalError("Employee not found", 404);
  return emp;
}

function loadChain(organizationId: string, chainId: string) {
  return db.query.approvalChain.findFirst({
    where: and(
      eq(approvalChain.id, chainId),
      eq(approvalChain.organizationId, organizationId),
      notDeleted(approvalChain.deletedAt)
    ),
    with: { steps: { with: { approver: { with: { user: { columns: { name: true, email: true } } } } } } },
  });
}

/**
 * Payroll workflow tools beyond the basics in payroll.ts: run sign-off,
 * voiding and deleting runs, bonuses, one-off runs, payslip emails, payroll
 * settings, employee tax setup and deductions, approval chains, and paying
 * contractors. All amounts are integer cents.
 */
export function registerPayrollAdminTools(server: McpServer, ctx: AuthContext) {
  // ─── Run lifecycle ────────────────────────────────────────────────
  server.tool(
    "delete_payroll_run",
    "Delete a payroll run that isn't finished yet (draft or waiting for sign-off). Its pay items and sign-off records are removed; deleting an unfinished final pay run makes that employee active again. Finished runs can't be deleted; use void_payroll_run instead. Returns the deleted run.",
    {
      payRunId: z.string().uuid().describe("UUID of the draft or pending-approval payroll run"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const run = await deleteDraftPayrollRun(ctx, params.payRunId);
        logAudit({ ctx, action: "delete", entityType: "payrollRun", entityId: params.payRunId });
        return { run, deleted: true };
      })
  );

  server.tool(
    "void_payroll_run",
    "Void a finished (completed) payroll run: posts a reversing journal entry on the same date as the run's entry (the pay period end) that undoes the run's wages, withholdings and bank payment, marks the original entry voided, sets the run to 'void', and refreshes leave balances. Refused when that date is in a locked period. Returns the voided run and reversalEntryId.",
    {
      payRunId: z.string().uuid().describe("UUID of the completed payroll run to void"),
      reason: z.string().optional().describe("Why the run is being voided (kept on the voided journal entry)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const result = await voidPayrollRun(ctx, params.payRunId, params.reason ?? null);
        logAudit({ ctx, action: "void", entityType: "payrollRun", entityId: params.payRunId, changes: { reason: params.reason ?? null } });
        return result;
      })
  );

  server.tool(
    "submit_payroll_run_for_approval",
    "Send a draft payroll run for sign-off. Needs an active approval chain (see list_payroll_approval_chains); one pending approval is created per approver. Returns the run with status 'pending_approval'.",
    {
      payRunId: z.string().uuid().describe("UUID of the draft payroll run"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const run = await submitRunForApproval(ctx, params.payRunId);
        logAudit({ ctx, action: "submit_for_approval", entityType: "payrollRun", entityId: params.payRunId });
        return { run };
      })
  );

  server.tool(
    "approve_payroll_run",
    "Sign off a payroll run waiting for approval, as the current user (who must be one of its pending approvers). When every approver has signed off the run becomes approved and can be finished with process_payroll_run. Returns the run.",
    {
      payRunId: z.string().uuid().describe("UUID of the payroll run with status 'pending_approval'"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:payroll");
        const run = await approveRun(ctx, params.payRunId);
        logAudit({ ctx, action: "approve", entityType: "payrollRun", entityId: params.payRunId });
        return { run };
      })
  );

  server.tool(
    "reject_payroll_run",
    "Reject a payroll run waiting for approval, as the current user (who must be one of its pending approvers). The run goes back to draft so it can be fixed and sent again. Returns the run.",
    {
      payRunId: z.string().uuid().describe("UUID of the payroll run with status 'pending_approval'"),
      reason: z.string().optional().describe("Why the run was rejected, shown to whoever runs payroll"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:payroll");
        const run = await rejectRun(ctx, params.payRunId, params.reason ?? null);
        logAudit({ ctx, action: "reject", entityType: "payrollRun", entityId: params.payRunId, changes: { reason: params.reason ?? null } });
        return { run };
      })
  );

  server.tool(
    "add_payroll_bonus",
    "Add a bonus to a draft payroll run for one employee in it. The employee's pay is recalculated with the bonus included in gross and taxed with it, the run totals are updated, and any sign-off is cleared. Returns the bonus and the updated run.",
    {
      payRunId: z.string().uuid().describe("UUID of the draft payroll run"),
      employeeId: z.string().uuid().describe("UUID of the payroll employee to pay the bonus to"),
      bonusType: z.enum(BONUS_TYPES).describe("Kind of bonus"),
      amount: z.number().int().min(1).describe("Bonus amount in integer cents (e.g. 50000 = $500.00)"),
      description: z.string().optional().describe("Optional note shown with the bonus"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const result = await addBonusToRun(ctx, params.payRunId, {
          employeeId: params.employeeId,
          bonusType: params.bonusType,
          amount: params.amount,
          description: params.description ?? null,
        });
        logAudit({ ctx, action: "add_bonus", entityType: "payrollRun", entityId: params.payRunId, changes: { bonusId: result.bonus.id, amount: params.amount } });
        return result;
      })
  );

  server.tool(
    "remove_payroll_bonus",
    "Remove a bonus from a draft payroll run. The employee's pay and the run totals are recalculated. Returns the removed bonus and the updated run.",
    {
      payRunId: z.string().uuid().describe("UUID of the draft payroll run"),
      bonusId: z.string().uuid().describe("UUID of the bonus to remove"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const result = await removeBonusFromRun(ctx, params.payRunId, params.bonusId);
        logAudit({ ctx, action: "remove_bonus", entityType: "payrollRun", entityId: params.payRunId, changes: { bonusId: params.bonusId } });
        return result;
      })
  );

  // ─── One-off runs ─────────────────────────────────────────────────
  server.tool(
    "create_bonus_payroll_run",
    "Pay bonuses outside the regular payroll as their own off-cycle run. Each employee's bonuses are added up and taxed (income tax and FICA against year-to-date wages, plus employer taxes); no regular deductions are taken. The run is finished and posted straight away, unless payroll runs need sign-off, in which case it is left as a draft (needsSignOff: true) to send with submit_payroll_run_for_approval. Returns the run.",
    {
      payPeriodStart: z.string().describe("Pay period start date (YYYY-MM-DD)"),
      payPeriodEnd: z.string().describe("Pay period end date (YYYY-MM-DD); the journal entry is dated on this day"),
      notes: z.string().optional().describe("Optional note on the run"),
      bonuses: z
        .array(
          z.object({
            employeeId: z.string().uuid().describe("Payroll employee UUID"),
            bonusType: z.enum(BONUS_TYPES).describe("Kind of bonus"),
            amount: z.number().int().min(1).describe("Bonus amount in integer cents"),
            description: z.string().optional().describe("Optional note for this bonus"),
          })
        )
        .min(1)
        .describe("One or more bonuses to pay"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const run = await createBonusOnlyRun(ctx, params);
        logAudit({ ctx, action: "create_bonus_run", entityType: "payrollRun", entityId: run.id });
        return { run };
      })
  );

  server.tool(
    "create_final_pay_run",
    "Pay an employee who is leaving: pay for the days worked in the final period (salary at a daily rate of salary/365, or hourly from approved timesheets, otherwise 8 hours per weekday), optionally plus their unused vacation and personal leave paid out. Taxed and with deductions like a regular run. The employee is set inactive with the period end as their last day (deleting the run before it is finished makes them active again). Finished straight away unless payroll runs need sign-off (needsSignOff: true). Returns the run.",
    {
      employeeId: z.string().uuid().describe("UUID of the payroll employee who is leaving"),
      payPeriodStart: z.string().describe("First day of the final pay period (YYYY-MM-DD)"),
      payPeriodEnd: z.string().describe("Last day worked (YYYY-MM-DD)"),
      includeUnusedPto: z.boolean().optional().describe("When true, pay out the remaining vacation and personal leave hours"),
      notes: z.string().optional().describe("Optional note on the run"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const run = await createFinalPayRun(ctx, params);
        logAudit({ ctx, action: "create_termination_run", entityType: "payrollRun", entityId: run.id });
        return { run };
      })
  );

  server.tool(
    "create_correction_payroll_run",
    "Correct a finished payroll run with gross pay adjustments (positive to pay more, negative to claw back) for employees who were in it. Tax is adjusted in proportion to the original run. Finished straight away unless payroll runs need sign-off (needsSignOff: true). Returns the correction run.",
    {
      parentRunId: z.string().uuid().describe("UUID of the completed payroll run being corrected"),
      notes: z.string().optional().describe("Optional note on the correction"),
      adjustments: z
        .array(
          z.object({
            employeeId: z.string().uuid().describe("Payroll employee UUID; must have been paid in the parent run"),
            grossAdjustment: z.number().int().describe("Change to gross pay in integer cents; negative to reduce. Can't be 0."),
            description: z.string().optional().describe("Why this adjustment is needed"),
          })
        )
        .min(1)
        .describe("One adjustment per employee"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const run = await createCorrectionRun(ctx, params);
        logAudit({ ctx, action: "create_correction_run", entityType: "payrollRun", entityId: run.id });
        return { run };
      })
  );

  server.tool(
    "email_payslips",
    "Email each payslip in a finished run to its employee, with the PDF attached. Only payslips not sent yet go out, and employees without an email address are skipped. Generate them first with generate_payslips. Returns { sent, skippedNoEmail, alreadySent, failed: [employee names] }.",
    {
      payRunId: z.string().uuid().describe("UUID of the completed payroll run"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const result = await emailRunPayslips(ctx, params.payRunId);
        logAudit({ ctx, action: "email_payslips", entityType: "payrollRun", entityId: params.payRunId, changes: { sent: result.sent } });
        return result;
      })
  );

  // ─── Settings ─────────────────────────────────────────────────────
  server.tool(
    "get_payroll_settings",
    "Get the organization's payroll settings: default tax rate (basis points), overtime rule (hours per week and multiplier), currency, posting account codes, auto-approve, and the payroll tax parameters (Social Security, Medicare, FUTA, SUTA rates in basis points and wage bases in integer cents). Creates the default settings if none exist yet. Returns { settings }.",
    {},
    () =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        return { settings: await resolvePayrollSettings(ctx.organizationId) };
      })
  );

  server.tool(
    "update_payroll_settings",
    "Update the organization's payroll settings. Only the fields given change. Rates are in basis points (620 = 6.2%); wage bases and thresholds are integer cents per year. Returns { settings }.",
    {
      defaultTaxRate: z.number().int().min(0).max(10000).optional().describe("Flat income tax rate for new employees, in basis points (2200 = 22%)"),
      overtimeThresholdHours: z.number().min(0).optional().describe("Hours per week after which overtime is paid (e.g. 40)"),
      overtimeMultiplier: z.number().min(1).optional().describe("Overtime pay multiplier (e.g. 1.5)"),
      defaultCurrency: z.string().min(3).max(3).optional().describe("ISO currency code for payroll (e.g. USD)"),
      salaryExpenseAccountCode: z.string().optional().describe("Account code wages are debited to"),
      taxPayableAccountCode: z.string().optional().describe("Account code income tax withheld is credited to"),
      bankAccountCode: z.string().optional().describe("Account code take-home pay is paid from"),
      autoApprovalEnabled: z.boolean().optional().describe("When true, runs can be finished without sign-off even if an approval chain is active"),
      ssWageBaseCents: z.number().int().min(0).optional().describe("Social Security wage base per year, in cents"),
      ssRateBp: z.number().int().min(0).max(10000).optional().describe("Social Security rate in basis points (620 = 6.2%)"),
      medicareRateBp: z.number().int().min(0).max(10000).optional().describe("Medicare rate in basis points (145 = 1.45%)"),
      addlMedicareThresholdCents: z.number().int().min(0).optional().describe("Year-to-date wages above which Additional Medicare applies, in cents"),
      addlMedicareRateBp: z.number().int().min(0).max(10000).optional().describe("Additional Medicare rate in basis points (90 = 0.9%)"),
      employerFicaEnabled: z.boolean().optional().describe("Whether the employer's matching Social Security and Medicare are charged"),
      futaRateBp: z.number().int().min(0).max(10000).optional().describe("Federal unemployment (FUTA) rate in basis points"),
      futaWageBaseCents: z.number().int().min(0).optional().describe("FUTA wage base per year, in cents"),
      sutaRateBp: z.number().int().min(0).max(10000).optional().describe("State unemployment (SUTA) rate in basis points"),
      sutaWageBaseCents: z.number().int().min(0).optional().describe("SUTA wage base per year, in cents"),
      defaultTaxYear: z.number().int().min(2000).max(2100).nullable().optional().describe("Tax year whose brackets to use; null for the year of each pay period"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        await resolvePayrollSettings(ctx.organizationId);
        const [settings] = await db
          .update(payrollSettings)
          .set({ ...params, updatedAt: new Date() })
          .where(eq(payrollSettings.organizationId, ctx.organizationId))
          .returning();
        logAudit({ ctx, action: "update", entityType: "payrollSettings", entityId: settings.id, changes: params });
        return { settings };
      })
  );

  // ─── Employees ────────────────────────────────────────────────────
  server.tool(
    "update_payroll_employee",
    "Update a payroll employee. Only the fields given change. Money is integer cents; taxRate is basis points. Returns { employee }.",
    {
      employeeId: z.string().uuid().describe("UUID of the payroll employee"),
      name: z.string().min(1).optional().describe("Full name"),
      email: z.string().email().nullable().optional().describe("Email for payslips; null to clear"),
      position: z.string().nullable().optional().describe("Job title"),
      department: z.string().nullable().optional().describe("Department name; null to clear"),
      compensationType: z.enum(["salary", "hourly", "milestone", "commission"]).optional().describe("How the employee is paid"),
      salary: z.number().int().min(0).optional().describe("Annual salary in integer cents"),
      hourlyRate: z.number().int().min(0).nullable().optional().describe("Hourly rate in integer cents"),
      payFrequency: z.enum(["weekly", "biweekly", "monthly"]).optional().describe("How often they are paid"),
      taxRate: z.number().int().min(0).max(10000).optional().describe("Flat income tax rate in basis points, used when no federal brackets are set up"),
      currency: currencyCodeSchema.optional().describe("ISO currency the employee is paid in"),
      compensationBandId: z.string().uuid().nullable().optional().describe("Pay band UUID (from list_compensation_bands); null to clear"),
      bankAccountNumber: z.string().nullable().optional().describe("Bank account number for pay"),
      endDate: z.string().nullable().optional().describe("Last day of employment (YYYY-MM-DD)"),
      isActive: z.boolean().optional().describe("False to stop including them in pay runs"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const { employeeId, ...changes } = params;
        await findEmployee(ctx.organizationId, employeeId);
        if (changes.compensationBandId) {
          const band = await db.query.compensationBand.findFirst({
            where: and(
              eq(compensationBand.id, changes.compensationBandId),
              eq(compensationBand.organizationId, ctx.organizationId),
              notDeleted(compensationBand.deletedAt)
            ),
            columns: { id: true },
          });
          if (!band) throw new ApprovalError("That pay band wasn't found");
        }
        const [employee] = await db
          .update(payrollEmployee)
          .set({ ...changes, updatedAt: new Date() })
          .where(eq(payrollEmployee.id, employeeId))
          .returning();
        logAudit({ ctx, action: "update", entityType: "payroll_employee", entityId: employeeId, changes });
        return { employee };
      })
  );

  server.tool(
    "get_employee_tax_config",
    "Get an employee's withholding setup: filing status, federal and state allowances, extra federal and state withholding per pay period (integer cents), state and local tax codes (matched to tax bracket jurisdictions), and whether they are exempt from income tax. Returns { taxConfig }.",
    {
      employeeId: z.string().uuid().describe("UUID of the payroll employee"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        await findEmployee(ctx.organizationId, params.employeeId);
        let taxConfig = await db.query.employeeTaxConfig.findFirst({
          where: eq(employeeTaxConfig.employeeId, params.employeeId),
        });
        if (!taxConfig) {
          [taxConfig] = await db.insert(employeeTaxConfig).values({ employeeId: params.employeeId }).returning();
        }
        return { taxConfig };
      })
  );

  server.tool(
    "update_employee_tax_config",
    "Update an employee's withholding setup. Only the fields given change. State and local income tax are only withheld when stateCode/localCode match the jurisdiction of tax brackets set up for the org. Exempt skips income tax only; Social Security and Medicare are still withheld. Returns { taxConfig }.",
    {
      employeeId: z.string().uuid().describe("UUID of the payroll employee"),
      filingStatus: z.enum(FILING_STATUSES).optional().describe("Filing status from the employee's W-4"),
      federalAllowances: z.number().int().min(0).optional().describe("Federal allowances"),
      stateAllowances: z.number().int().min(0).optional().describe("State allowances"),
      additionalWithholding: z.number().int().min(0).optional().describe("Extra federal income tax per pay period, in integer cents"),
      additionalStateWithholding: z.number().int().min(0).optional().describe("Extra state income tax per pay period, in integer cents"),
      stateCode: z.string().trim().max(10).nullable().optional().describe("State tax code, e.g. CA; null for none"),
      localCode: z.string().trim().max(20).nullable().optional().describe("Local tax code, e.g. NYC; null for none"),
      exempt: z.boolean().optional().describe("True to skip income tax withholding"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const { employeeId, ...raw } = params;
        await findEmployee(ctx.organizationId, employeeId);
        const changes = {
          ...raw,
          ...(raw.stateCode !== undefined ? { stateCode: raw.stateCode ? raw.stateCode.toUpperCase() : null } : {}),
          ...(raw.localCode !== undefined ? { localCode: raw.localCode ? raw.localCode.toUpperCase() : null } : {}),
        };
        const existing = await db.query.employeeTaxConfig.findFirst({
          where: eq(employeeTaxConfig.employeeId, employeeId),
          columns: { id: true },
        });
        const [taxConfig] = existing
          ? await db
              .update(employeeTaxConfig)
              .set({ ...changes, updatedAt: new Date() })
              .where(eq(employeeTaxConfig.employeeId, employeeId))
              .returning()
          : await db.insert(employeeTaxConfig).values({ employeeId, ...changes }).returning();
        logAudit({ ctx, action: "update", entityType: "employeeTaxConfig", entityId: taxConfig.id, changes });
        return { taxConfig };
      })
  );

  // ─── Deductions ───────────────────────────────────────────────────
  server.tool(
    "list_deduction_types",
    "List the organization's deduction types (e.g. 401(k), health insurance). Pre-tax deductions reduce taxable wages; post-tax ones come out of take-home pay. defaultAmount is integer cents, defaultPercent is a percentage of gross. Returns { data }.",
    {},
    () =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const data = await db.query.deductionType.findMany({
          where: and(eq(deductionType.organizationId, ctx.organizationId), notDeleted(deductionType.deletedAt)),
        });
        return { data };
      })
  );

  server.tool(
    "create_deduction_type",
    "Create a deduction type that can then be assigned to employees with assign_employee_deduction. Returns { deductionType }.",
    {
      name: z.string().min(1).describe("Name shown on payslips, e.g. '401(k)'"),
      description: z.string().optional().describe("Optional description"),
      category: z.enum(["pre_tax", "post_tax"]).describe("pre_tax reduces taxable wages; post_tax is taken after tax"),
      defaultAmount: z.number().int().min(0).optional().describe("Default fixed amount per pay period, in integer cents"),
      defaultPercent: z.number().min(0).max(100).optional().describe("Default percentage of gross pay (5 = 5%)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const [row] = await db
          .insert(deductionType)
          .values({ organizationId: ctx.organizationId, ...params })
          .returning();
        logAudit({ ctx, action: "create", entityType: "deductionType", entityId: row.id });
        return { deductionType: row };
      })
  );

  server.tool(
    "list_employee_deductions",
    "List the deductions assigned to an employee, with their deduction type. amount is integer cents per pay period, percent is a percentage of gross; when both are empty the type's default is used. Returns { data }.",
    {
      employeeId: z.string().uuid().describe("UUID of the payroll employee"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        await findEmployee(ctx.organizationId, params.employeeId);
        const data = await db.query.employeeDeduction.findMany({
          where: and(eq(employeeDeduction.employeeId, params.employeeId), notDeleted(employeeDeduction.deletedAt)),
          with: { deductionType: true },
        });
        return { data };
      })
  );

  server.tool(
    "assign_employee_deduction",
    "Assign a deduction type to an employee. Give either a fixed amount (integer cents per pay period) or a percent of gross, not both; leave both out to use the type's default. Deductions are taken in pay runs whose period overlaps startDate to endDate. Returns { deduction }.",
    {
      employeeId: z.string().uuid().describe("UUID of the payroll employee"),
      deductionTypeId: z.string().uuid().describe("UUID of the deduction type (from list_deduction_types)"),
      timing: z.enum(["recurring", "one_time"]).optional().describe("recurring (every pay run in the dates) or one_time (taken in the next finished pay run, then switched off); defaults to recurring"),
      amount: z.number().int().min(0).optional().describe("Fixed amount per pay period in integer cents"),
      percent: z.number().min(0).max(100).optional().describe("Percentage of gross pay (5 = 5%)"),
      startDate: z.string().optional().describe("First date it applies (YYYY-MM-DD)"),
      endDate: z.string().optional().describe("Last date it applies (YYYY-MM-DD)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const { employeeId, ...values } = params;
        await findEmployee(ctx.organizationId, employeeId);
        const type = await db.query.deductionType.findFirst({
          where: and(
            eq(deductionType.id, values.deductionTypeId),
            eq(deductionType.organizationId, ctx.organizationId),
            notDeleted(deductionType.deletedAt)
          ),
          columns: { id: true },
        });
        if (!type) throw new ApprovalError("Deduction type not found", 404);
        if (values.amount != null && values.percent != null) {
          throw new ApprovalError("Use either a fixed amount or a percentage, not both");
        }
        const [deduction] = await db.insert(employeeDeduction).values({ employeeId, ...values }).returning();
        logAudit({ ctx, action: "create", entityType: "employeeDeduction", entityId: deduction.id });
        return { deduction };
      })
  );

  server.tool(
    "remove_employee_deduction",
    "Remove a deduction from an employee so it isn't taken in future pay runs. Past pay runs are not changed. Returns { removed: true }.",
    {
      employeeId: z.string().uuid().describe("UUID of the payroll employee"),
      deductionId: z.string().uuid().describe("UUID of the employee deduction (from list_employee_deductions)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        await findEmployee(ctx.organizationId, params.employeeId);
        const [removed] = await db
          .update(employeeDeduction)
          .set(softDelete())
          .where(and(
            eq(employeeDeduction.id, params.deductionId),
            eq(employeeDeduction.employeeId, params.employeeId),
            notDeleted(employeeDeduction.deletedAt)
          ))
          .returning({ id: employeeDeduction.id });
        if (!removed) throw new ApprovalError("Deduction not found", 404);
        logAudit({ ctx, action: "delete", entityType: "employeeDeduction", entityId: removed.id });
        return { removed: true, deductionId: removed.id };
      })
  );

  // ─── Approval chains ──────────────────────────────────────────────
  server.tool(
    "list_payroll_approval_chains",
    "List the payroll approval chains. While a chain is active and has approvers (and auto-approve is off), pay runs must be signed off before they can be finished. Returns { data } with each chain's ordered steps and approver names.",
    {},
    () =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:payroll");
        const data = await db.query.approvalChain.findMany({
          where: and(eq(approvalChain.organizationId, ctx.organizationId), notDeleted(approvalChain.deletedAt)),
          with: { steps: { with: { approver: { with: { user: { columns: { name: true, email: true } } } } } } },
        });
        return { data };
      })
  );

  server.tool(
    "create_payroll_approval_chain",
    "Create a payroll approval chain with its approvers. Returns { chain }.",
    {
      name: z.string().min(1).describe("Name of the chain, e.g. 'Finance sign-off'"),
      description: z.string().optional().describe("Optional description"),
      isActive: z.boolean().optional().describe("Whether the chain is in use; defaults to true"),
      steps: chainStepsSchema.optional(),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:payroll");
        const { steps, ...values } = params;
        if (steps && !(await approversInOrg(ctx.organizationId, steps.map((s) => s.approverId)))) {
          throw new ApprovalError("Every approver must be a member of this workspace");
        }
        const id = await db.transaction(async (tx) => {
          const [row] = await tx.insert(approvalChain).values({ organizationId: ctx.organizationId, ...values }).returning();
          if (steps && steps.length > 0) {
            await tx.insert(approvalChainStep).values(steps.map((s) => ({ chainId: row.id, ...s })));
          }
          return row.id;
        });
        logAudit({ ctx, action: "create", entityType: "approvalChain", entityId: id });
        return { chain: await loadChain(ctx.organizationId, id) };
      })
  );

  server.tool(
    "update_payroll_approval_chain",
    "Update a payroll approval chain. Only the fields given change; passing steps replaces all approvers. Returns { chain }.",
    {
      chainId: z.string().uuid().describe("UUID of the approval chain"),
      name: z.string().min(1).optional().describe("New name"),
      description: z.string().nullable().optional().describe("New description; null to clear"),
      isActive: z.boolean().optional().describe("Turn the chain on or off"),
      steps: chainStepsSchema.optional(),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:payroll");
        const { chainId, steps, ...changes } = params;
        if (!(await loadChain(ctx.organizationId, chainId))) throw new ApprovalError("Approval chain not found", 404);
        if (steps && !(await approversInOrg(ctx.organizationId, steps.map((s) => s.approverId)))) {
          throw new ApprovalError("Every approver must be a member of this workspace");
        }
        await db.transaction(async (tx) => {
          if (Object.keys(changes).length > 0) {
            await tx.update(approvalChain).set(changes).where(eq(approvalChain.id, chainId));
          }
          if (steps) {
            await tx.delete(approvalChainStep).where(eq(approvalChainStep.chainId, chainId));
            if (steps.length > 0) {
              await tx.insert(approvalChainStep).values(steps.map((s) => ({ chainId, ...s })));
            }
          }
        });
        logAudit({ ctx, action: "update", entityType: "approvalChain", entityId: chainId, changes: params });
        return { chain: await loadChain(ctx.organizationId, chainId) };
      })
  );

  server.tool(
    "delete_payroll_approval_chain",
    "Delete a payroll approval chain. Runs already waiting for sign-off keep their pending approvals. Returns { deleted: true }.",
    {
      chainId: z.string().uuid().describe("UUID of the approval chain"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "approve:payroll");
        const [row] = await db
          .update(approvalChain)
          .set(softDelete())
          .where(and(
            eq(approvalChain.id, params.chainId),
            eq(approvalChain.organizationId, ctx.organizationId),
            notDeleted(approvalChain.deletedAt)
          ))
          .returning({ id: approvalChain.id });
        if (!row) throw new ApprovalError("Approval chain not found", 404);
        logAudit({ ctx, action: "delete", entityType: "approvalChain", entityId: row.id });
        return { deleted: true, chainId: row.id };
      })
  );

  // ─── Contractor payments ──────────────────────────────────────────
  server.tool(
    "process_contractor_payment",
    "Pay a pending contractor payment: posts a balanced journal entry dated today (DR Contractor Expense 5130, CR the payroll bank account, or Checking Account 1100 when none is set) and marks the payment paid. Refused when today is in a locked period. Amounts are integer cents. Returns the payment and journalEntryId.",
    {
      contractorId: z.string().uuid().describe("UUID of the contractor"),
      paymentId: z.string().uuid().describe("UUID of the pending contractor payment"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contractors");
        const result = await processContractorPayment(ctx, params.contractorId, params.paymentId);
        logAudit({ ctx, action: "process", entityType: "contractorPayment", entityId: params.paymentId });
        return result;
      })
  );

  server.tool(
    "void_contractor_payment",
    "Cancel a contractor payment that hasn't been paid yet (status 'pending'). Paid payments can't be voided here. Returns { payment }.",
    {
      contractorId: z.string().uuid().describe("UUID of the contractor"),
      paymentId: z.string().uuid().describe("UUID of the pending contractor payment"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:contractors");
        const owner = await db.query.contractor.findFirst({
          where: and(
            eq(contractor.id, params.contractorId),
            eq(contractor.organizationId, ctx.organizationId),
            notDeleted(contractor.deletedAt)
          ),
          columns: { id: true },
        });
        if (!owner) throw new ApprovalError("Contractor not found", 404);
        const [payment] = await db
          .update(contractorPayment)
          .set({ status: "void" })
          .where(and(
            eq(contractorPayment.id, params.paymentId),
            eq(contractorPayment.contractorId, owner.id),
            eq(contractorPayment.status, "pending")
          ))
          .returning();
        if (!payment) throw new ApprovalError("No pending payment with that ID for this contractor", 404);
        logAudit({ ctx, action: "void", entityType: "contractorPayment", entityId: payment.id });
        return { payment };
      })
  );
}

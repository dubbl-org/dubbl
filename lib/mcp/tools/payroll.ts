import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  payrollEmployee,
  payrollRun,
  payrollItem,
  payrollItemTaxBreakdown,
  payrollItemEmployerTax,
  payrollSettings,
  employeeDeduction,
  employeeLeaveBalance,
  payslip,
  timesheet,
  taxFormGeneration,
  taxForm,
  payrollTaxPayment,
  contractor,
  contractorPayment,
  chartAccount,
  journalEntry,
  journalLine,
  member,
  auditLog,
} from "@/lib/db/schema";
import { eq, and, desc, sql, gte, lte, lt } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { postPayrollRun } from "@/lib/api/payroll-posting";
import {
  computeEmployeeWithholding,
  getEmployeeYtdWage,
  type TaxBreakdownLine,
  type EmployerTaxLine,
} from "@/lib/api/payroll-withholding";
import {
  getNextEntryNumber,
  findAccountByCode,
} from "@/lib/api/journal-automation";
import { getExchangeRate, convertAmount } from "@/lib/currency/converter";
import type { AuthContext } from "@/lib/api/auth-context";

type PayrollItemColumnType =
  | "regular_salary"
  | "hourly_pay"
  | "overtime"
  | "milestone_bonus"
  | "project_bonus"
  | "commission"
  | "deduction"
  | "reimbursement";

/** Per-pay-period gross for an annual salary at the given frequency. */
function calculateGrossPay(annualSalary: number, payFrequency: string): number {
  switch (payFrequency) {
    case "weekly":
      return Math.round(annualSalary / 52);
    case "biweekly":
      return Math.round(annualSalary / 26);
    case "monthly":
    default:
      return Math.round(annualSalary / 12);
  }
}

export function registerPayrollTools(server: McpServer, ctx: AuthContext) {
  // ─── Employees ────────────────────────────────────────────────────
  server.tool(
    "list_payroll_employees",
    "List payroll employees for the organization, optionally filtered by active status. Returns each employee's compensation (salary/hourlyRate in integer cents), pay frequency, tax rate (basis points), and PTO balance (hours). Use to find an employeeId before creating pay runs or reading leave balances.",
    {
      active: z
        .boolean()
        .optional()
        .describe("Filter by active status. true = only active employees, false = only inactive. Omit for all."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(50)
        .describe("Max rows to return (max 200)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");

        const conditions = [
          eq(payrollEmployee.organizationId, ctx.organizationId),
          notDeleted(payrollEmployee.deletedAt),
        ];
        if (params.active === true) conditions.push(eq(payrollEmployee.isActive, true));
        if (params.active === false) conditions.push(eq(payrollEmployee.isActive, false));

        const offset = (params.page - 1) * params.limit;
        const rows = await db.query.payrollEmployee.findMany({
          where: and(...conditions),
          orderBy: desc(payrollEmployee.createdAt),
          limit: params.limit,
          offset,
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(payrollEmployee)
          .where(and(...conditions));

        return {
          employees: rows.map((e) => ({
            id: e.id,
            name: e.name,
            email: e.email,
            employeeNumber: e.employeeNumber,
            position: e.position,
            department: e.department,
            compensationType: e.compensationType,
            salary: e.salary,
            hourlyRate: e.hourlyRate,
            payFrequency: e.payFrequency,
            taxRate: e.taxRate,
            currency: e.currency,
            startDate: e.startDate,
            endDate: e.endDate,
            ptoBalanceHours: e.ptoBalanceHours,
            isActive: e.isActive,
          })),
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "create_payroll_employee",
    "Create a payroll employee. Monetary amounts are integer cents: 'salary' is the ANNUAL salary in cents (required even for hourly employees, use 0), 'hourlyRate' is per-hour in cents. 'taxRate' is a flat fallback in basis points (2000 = 20%) used only when no progressive tax bracket schedule is configured. Returns the created employee.",
    {
      name: z.string().min(1).describe("Employee full name"),
      employeeNumber: z.string().min(1).describe("Unique employee number/identifier"),
      salary: z.number().int().min(0).describe("Annual salary in integer cents (use 0 for hourly employees)"),
      compensationType: z
        .enum(["salary", "hourly", "milestone", "commission"])
        .optional()
        .default("salary")
        .describe("How the employee is paid. 'salary' and 'hourly' are auto-included in regular pay runs."),
      payFrequency: z
        .enum(["weekly", "biweekly", "monthly"])
        .optional()
        .default("monthly")
        .describe("Pay period frequency"),
      hourlyRate: z
        .number()
        .int()
        .min(0)
        .nullable()
        .optional()
        .describe("Hourly rate in integer cents (required for hourly employees)"),
      taxRate: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(2000)
        .describe("Flat fallback tax rate in basis points (2000 = 20%); only used when no bracket schedule exists"),
      email: z.string().email().nullable().optional().describe("Employee email"),
      position: z.string().nullable().optional().describe("Job title / position"),
      startDate: z.string().min(1).describe("Employment start date (YYYY-MM-DD)"),
      endDate: z.string().nullable().optional().describe("Employment end date (YYYY-MM-DD), if any"),
      bankAccountNumber: z.string().nullable().optional().describe("Employee bank account number for net pay"),
      memberId: z.string().uuid().nullable().optional().describe("Optional UUID of the linked org member"),
      currency: z.string().optional().default("USD").describe("ISO currency code for this employee's pay (default USD)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");

        const [created] = await db
          .insert(payrollEmployee)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            email: params.email || null,
            employeeNumber: params.employeeNumber,
            position: params.position || null,
            salary: params.salary,
            payFrequency: params.payFrequency,
            taxRate: params.taxRate,
            bankAccountNumber: params.bankAccountNumber || null,
            startDate: params.startDate,
            endDate: params.endDate || null,
            memberId: params.memberId || null,
            compensationType: params.compensationType,
            hourlyRate: params.hourlyRate ?? null,
            currency: params.currency,
          })
          .returning();

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "created",
          entityType: "payroll_employee",
          entityId: created.id,
          changes: { name: created.name, employeeNumber: created.employeeNumber },
        });

        return { employee: created };
      })
  );

  // ─── Pay Runs ─────────────────────────────────────────────────────
  server.tool(
    "list_payroll_runs",
    "List payroll runs for the organization, optionally filtered by status. Each run carries totals in integer cents (totalGross, totalDeductions, totalNet), the pay period, run type, and the posted journalEntryId once processed. Use to find a payRunId.",
    {
      status: z
        .enum(["draft", "processing", "completed", "void", "pending_approval"])
        .optional()
        .describe("Filter by run status"),
      limit: z.number().int().min(1).max(200).optional().default(50).describe("Max rows to return (max 200)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");

        const conditions = [
          eq(payrollRun.organizationId, ctx.organizationId),
          notDeleted(payrollRun.deletedAt),
        ];
        if (params.status) conditions.push(eq(payrollRun.status, params.status));

        const offset = (params.page - 1) * params.limit;
        const rows = await db.query.payrollRun.findMany({
          where: and(...conditions),
          orderBy: desc(payrollRun.createdAt),
          limit: params.limit,
          offset,
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(payrollRun)
          .where(and(...conditions));

        return {
          runs: rows.map((r) => ({
            id: r.id,
            payPeriodStart: r.payPeriodStart,
            payPeriodEnd: r.payPeriodEnd,
            status: r.status,
            runType: r.runType,
            totalGross: r.totalGross,
            totalDeductions: r.totalDeductions,
            totalNet: r.totalNet,
            journalEntryId: r.journalEntryId,
            processedAt: r.processedAt,
            createdAt: r.createdAt,
          })),
          total: Number(countResult?.count ?? 0),
          page: params.page,
          limit: params.limit,
        };
      })
  );

  server.tool(
    "create_payroll_run",
    "Create a draft regular payroll run for a pay period. Auto-generates a pay item for every active salaried/hourly employee: gross pay is derived from salary/frequency (or approved timesheet hours for hourly), then the withholding engine computes income tax + employee FICA (and employer-side FICA/FUTA/SUTA) using each employee's tax config and the org's bracket schedule (falling back to the employee's flat taxRate when no brackets exist). Persists the run, items, and per-jurisdiction tax breakdowns. All amounts are integer cents. The run is created in 'draft' status and NOT yet posted to the ledger — call process_payroll_run to post and complete it. Returns the created run.",
    {
      payPeriodStart: z.string().min(1).describe("Pay period start date (YYYY-MM-DD)"),
      payPeriodEnd: z.string().min(1).describe("Pay period end date (YYYY-MM-DD)"),
      runType: z
        .enum(["regular", "off_cycle"])
        .optional()
        .default("regular")
        .describe("Run type. Use the dedicated routes for termination/bonus-only/correction runs."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");

        const employees = await db.query.payrollEmployee.findMany({
          where: and(
            eq(payrollEmployee.organizationId, ctx.organizationId),
            eq(payrollEmployee.isActive, true),
            notDeleted(payrollEmployee.deletedAt)
          ),
        });
        if (employees.length === 0) throw new Error("No active employees found");

        const settings = await db.query.payrollSettings.findFirst({
          where: eq(payrollSettings.organizationId, ctx.organizationId),
        });

        const overtimeThreshold = settings?.overtimeThresholdHours ?? 40;
        const overtimeMultiplier = settings?.overtimeMultiplier ?? 1.5;
        const defaultCurrency = settings?.defaultCurrency ?? "USD";

        // Pre-fetch FX rates for any non-default employee currencies.
        const fxRateCache = new Map<string, number>();
        for (const emp of employees) {
          const empCurrency = emp.currency ?? defaultCurrency;
          if (empCurrency !== defaultCurrency && !fxRateCache.has(empCurrency)) {
            const rate = await getExchangeRate(
              ctx.organizationId,
              empCurrency,
              defaultCurrency,
              params.payPeriodEnd
            );
            if (rate != null) fxRateCache.set(empCurrency, rate);
          }
        }

        let totalGross = 0;
        let totalDeductions = 0;
        let totalNet = 0;

        const items: Array<{
          employeeId: string;
          type: PayrollItemColumnType;
          description: string | null;
          grossAmount: number;
          taxAmount: number;
          deductions: number;
          netAmount: number;
          overtimeHours: number | null;
          overtimeAmount: number | null;
          preTaxDeductions: number;
          postTaxDeductions: number;
          timesheetId: string | null;
          currency: string;
          fxRate: number;
          taxBreakdown: TaxBreakdownLine[];
          employerTaxBreakdown: EmployerTaxLine[];
        }> = [];

        for (const emp of employees) {
          let grossAmount = 0;
          let itemType: PayrollItemColumnType = "regular_salary";
          let description: string | null = null;
          let otHours: number | null = null;
          let otAmount: number | null = null;
          let linkedTimesheetId: string | null = null;

          switch (emp.compensationType) {
            case "hourly": {
              if (!emp.hourlyRate) continue;
              const approvedTimesheets = await db.query.timesheet.findMany({
                where: and(
                  eq(timesheet.employeeId, emp.id),
                  eq(timesheet.status, "approved"),
                  lte(timesheet.periodStart, params.payPeriodEnd),
                  gte(timesheet.periodEnd, params.payPeriodStart)
                ),
                with: { entries: true },
              });

              let totalHours = 0;
              if (approvedTimesheets.length > 0) {
                for (const ts of approvedTimesheets) {
                  for (const entry of ts.entries) totalHours += entry.hours;
                }
                linkedTimesheetId = approvedTimesheets[0].id;
              } else {
                totalHours =
                  emp.payFrequency === "weekly"
                    ? 40
                    : emp.payFrequency === "biweekly"
                      ? 80
                      : 173;
              }

              let regularHours = totalHours;
              let overtimeHrs = 0;
              if (totalHours > overtimeThreshold) {
                regularHours = overtimeThreshold;
                overtimeHrs = totalHours - overtimeThreshold;
              }

              const regularAmount = Math.round(emp.hourlyRate * regularHours);
              const overtimeAmt = Math.round(emp.hourlyRate * overtimeMultiplier * overtimeHrs);
              grossAmount = regularAmount + overtimeAmt;

              if (overtimeHrs > 0) {
                otHours = overtimeHrs;
                otAmount = overtimeAmt;
                description = `${regularHours}h @ ${(emp.hourlyRate / 100).toFixed(2)}/hr + ${overtimeHrs}h OT @ ${((emp.hourlyRate * overtimeMultiplier) / 100).toFixed(2)}/hr`;
              } else {
                description = `${totalHours}h @ ${(emp.hourlyRate / 100).toFixed(2)}/hr`;
              }
              itemType = "hourly_pay";
              break;
            }
            case "milestone":
            case "commission":
              // Paid only when milestones/commissions are recorded.
              continue;
            case "salary":
            default: {
              grossAmount = calculateGrossPay(emp.salary, emp.payFrequency);
              itemType = "regular_salary";
              break;
            }
          }

          const empDeductions = await db.query.employeeDeduction.findMany({
            where: and(
              eq(employeeDeduction.employeeId, emp.id),
              eq(employeeDeduction.isActive, true),
              notDeleted(employeeDeduction.deletedAt)
            ),
            with: { deductionType: true },
          });

          let preTaxDeductionTotal = 0;
          let postTaxDeductionTotal = 0;
          for (const ded of empDeductions) {
            if (!ded.deductionType?.isActive) continue;
            let dedAmount = 0;
            if (ded.amount != null) dedAmount = ded.amount;
            else if (ded.percent != null) dedAmount = Math.round((grossAmount * ded.percent) / 100);
            else if (ded.deductionType.defaultAmount != null) dedAmount = ded.deductionType.defaultAmount;
            else if (ded.deductionType.defaultPercent != null)
              dedAmount = Math.round((grossAmount * ded.deductionType.defaultPercent) / 100);
            if (dedAmount <= 0) continue;
            if (ded.deductionType.category === "pre_tax") preTaxDeductionTotal += dedAmount;
            else postTaxDeductionTotal += dedAmount;
          }

          const taxableIncome = Math.max(0, grossAmount - preTaxDeductionTotal);

          const ytdWage = await getEmployeeYtdWage(ctx.organizationId, emp.id, params.payPeriodStart);
          const withholding = await computeEmployeeWithholding(
            ctx.organizationId,
            emp,
            settings ?? undefined,
            taxableIncome,
            ytdWage,
            params.payPeriodStart
          );
          const taxAmount = withholding.totalTax;

          const totalItemDeductions = taxAmount + preTaxDeductionTotal + postTaxDeductionTotal;
          const netAmount = grossAmount - totalItemDeductions;

          const empCurrency = emp.currency ?? defaultCurrency;
          let fxRate = 1;
          if (empCurrency !== defaultCurrency) {
            const rateInt = fxRateCache.get(empCurrency);
            if (rateInt != null) fxRate = rateInt / 1_000_000;
          }

          if (empCurrency === defaultCurrency) {
            totalGross += grossAmount;
            totalDeductions += totalItemDeductions;
            totalNet += netAmount;
          } else {
            const rateInt = fxRateCache.get(empCurrency) ?? 1_000_000;
            totalGross += convertAmount(grossAmount, rateInt);
            totalDeductions += convertAmount(totalItemDeductions, rateInt);
            totalNet += convertAmount(netAmount, rateInt);
          }

          items.push({
            employeeId: emp.id,
            type: itemType,
            description,
            grossAmount,
            taxAmount,
            deductions: totalItemDeductions,
            netAmount,
            overtimeHours: otHours,
            overtimeAmount: otAmount,
            preTaxDeductions: preTaxDeductionTotal,
            postTaxDeductions: postTaxDeductionTotal,
            timesheetId: linkedTimesheetId,
            currency: empCurrency,
            fxRate,
            taxBreakdown: withholding.breakdown,
            employerTaxBreakdown: withholding.employerBreakdown,
          });
        }

        if (items.length === 0) throw new Error("No payable employees found for this period");

        const run = await db.transaction(async (tx) => {
          const [createdRun] = await tx
            .insert(payrollRun)
            .values({
              organizationId: ctx.organizationId,
              payPeriodStart: params.payPeriodStart,
              payPeriodEnd: params.payPeriodEnd,
              runType: params.runType,
              totalGross,
              totalDeductions,
              totalNet,
            })
            .returning();

          const insertedItems = await tx
            .insert(payrollItem)
            .values(
              items.map((item) => {
                const { taxBreakdown, employerTaxBreakdown, ...columns } = item;
                void taxBreakdown;
                void employerTaxBreakdown;
                return { payrollRunId: createdRun.id, ...columns };
              })
            )
            .returning({ id: payrollItem.id });

          const taxRows: (typeof payrollItemTaxBreakdown.$inferInsert)[] = [];
          const employerRows: (typeof payrollItemEmployerTax.$inferInsert)[] = [];
          items.forEach((item, idx) => {
            const payrollItemId = insertedItems[idx].id;
            for (const line of item.taxBreakdown) taxRows.push({ payrollItemId, ...line });
            for (const line of item.employerTaxBreakdown) employerRows.push({ payrollItemId, ...line });
          });
          if (taxRows.length > 0) await tx.insert(payrollItemTaxBreakdown).values(taxRows);
          if (employerRows.length > 0) await tx.insert(payrollItemEmployerTax).values(employerRows);

          return createdRun;
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "created",
          entityType: "payroll_run",
          entityId: run.id,
          changes: { totalGross, totalNet, itemCount: items.length },
        });

        return { run };
      })
  );

  server.tool(
    "process_payroll_run",
    "Process (post) a draft payroll run: posts ONE balanced journal entry (DR gross wages 5100 + employer payroll taxes 5120; CR income-tax-payable 2220, payroll-taxes-payable 2235, pension/benefits 2245, etc.; CR net pay to the bank account) and marks the run 'completed', atomically. The withholding split is driven from the per-item tax breakdowns. Stamps payrollRun.journalEntryId. Amounts are integer cents. Returns the run and the posted journalEntryId.",
    {
      payRunId: z.string().describe("UUID of the draft payroll run to process"),
      accrued: z
        .boolean()
        .optional()
        .default(false)
        .describe("When true, credit net pay to Wages Payable (2310) instead of the bank account (liability recognized but not yet disbursed)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");

        const run = await db.query.payrollRun.findFirst({
          where: and(
            eq(payrollRun.id, params.payRunId),
            eq(payrollRun.organizationId, ctx.organizationId),
            notDeleted(payrollRun.deletedAt)
          ),
        });
        if (!run) throw new Error("Payroll run not found");

        const isApprovedPendingRun =
          run.status === "pending_approval" && run.approvalStatus === "approved";
        if (run.status !== "draft" && !isApprovedPendingRun) {
          throw new Error("Only draft payroll runs can be processed");
        }

        const updated = await db.transaction(async (tx) => {
          const journalEntryId = await postPayrollRun(
            { organizationId: ctx.organizationId, userId: ctx.userId },
            run.id,
            tx,
            { accrued: params.accrued }
          );

          const [row] = await tx
            .update(payrollRun)
            .set({ status: "completed", processedAt: new Date() })
            .where(eq(payrollRun.id, run.id))
            .returning();

          return { ...row, journalEntryId };
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "process_payroll_run",
          entityType: "payroll_run",
          entityId: run.id,
          changes: { journalEntryId: updated.journalEntryId },
        });

        return { run: updated, journalEntryId: updated.journalEntryId };
      })
  );

  server.tool(
    "generate_payslips",
    "Generate payslips for every item in a COMPLETED payroll run, computing each employee's year-to-date gross/net/tax (in integer cents) across all completed runs up to this period. Call after process_payroll_run. Returns the number of payslips generated.",
    {
      payRunId: z.string().describe("UUID of the completed payroll run to generate payslips for"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");

        const run = await db.query.payrollRun.findFirst({
          where: and(
            eq(payrollRun.id, params.payRunId),
            eq(payrollRun.organizationId, ctx.organizationId),
            notDeleted(payrollRun.deletedAt)
          ),
          with: { items: true },
        });
        if (!run) throw new Error("Payroll run not found");
        if (run.status !== "completed") throw new Error("Can only generate payslips for completed runs");

        const payslips: (typeof payslip.$inferInsert)[] = [];
        for (const item of run.items) {
          const [ytd] = await db
            .select({
              ytdGross: sql<number>`coalesce(sum(${payrollItem.grossAmount}), 0)`.mapWith(Number),
              ytdNet: sql<number>`coalesce(sum(${payrollItem.netAmount}), 0)`.mapWith(Number),
              ytdTax: sql<number>`coalesce(sum(${payrollItem.taxAmount}), 0)`.mapWith(Number),
            })
            .from(payrollItem)
            .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
            .where(
              and(
                eq(payrollItem.employeeId, item.employeeId),
                eq(payrollRun.status, "completed"),
                eq(payrollRun.organizationId, ctx.organizationId),
                lte(payrollRun.payPeriodEnd, run.payPeriodEnd)
              )
            );

          payslips.push({
            payrollRunId: run.id,
            employeeId: item.employeeId,
            payrollItemId: item.id,
            grossAmount: item.grossAmount,
            netAmount: item.netAmount,
            taxAmount: item.taxAmount,
            deductionsBreakdown: [],
            ytdGross: ytd?.ytdGross || 0,
            ytdNet: ytd?.ytdNet || 0,
            ytdTax: ytd?.ytdTax || 0,
          });
        }

        if (payslips.length > 0) await db.insert(payslip).values(payslips);

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "generate_payslips",
          entityType: "payroll_run",
          entityId: run.id,
          changes: { count: payslips.length },
        });

        return { count: payslips.length };
      })
  );

  server.tool(
    "list_payslips",
    "List generated payslips for a payroll run. Each payslip carries grossAmount, netAmount, taxAmount and year-to-date totals (ytdGross/ytdNet/ytdTax), all in integer cents. Use generate_payslips first if a completed run has none.",
    {
      payRunId: z.string().describe("UUID of the payroll run to list payslips for"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");

        const run = await db.query.payrollRun.findFirst({
          where: and(
            eq(payrollRun.id, params.payRunId),
            eq(payrollRun.organizationId, ctx.organizationId),
            notDeleted(payrollRun.deletedAt)
          ),
        });
        if (!run) throw new Error("Payroll run not found");

        const rows = await db.query.payslip.findMany({
          where: eq(payslip.payrollRunId, params.payRunId),
          with: { employee: true },
        });

        return {
          payslips: rows.map((p) => ({
            id: p.id,
            employeeId: p.employeeId,
            employeeName: p.employee?.name ?? null,
            payrollItemId: p.payrollItemId,
            status: p.status,
            grossAmount: p.grossAmount,
            netAmount: p.netAmount,
            taxAmount: p.taxAmount,
            ytdGross: p.ytdGross,
            ytdNet: p.ytdNet,
            ytdTax: p.ytdTax,
            generatedAt: p.generatedAt,
          })),
        };
      })
  );

  server.tool(
    "list_payroll_run_items",
    "List the pay items (one per paid employee) for a payroll run, including each item's gross, tax, deductions and net (all integer cents) plus the per-jurisdiction employee and employer tax breakdown (taxKind + amount in cents). Use to inspect how a run was calculated.",
    {
      payRunId: z.string().describe("UUID of the payroll run to list items for"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");

        const run = await db.query.payrollRun.findFirst({
          where: and(
            eq(payrollRun.id, params.payRunId),
            eq(payrollRun.organizationId, ctx.organizationId),
            notDeleted(payrollRun.deletedAt)
          ),
        });
        if (!run) throw new Error("Payroll run not found");

        const rows = await db.query.payrollItem.findMany({
          where: eq(payrollItem.payrollRunId, params.payRunId),
          with: {
            employee: true,
            taxBreakdowns: true,
            employerTaxBreakdowns: true,
          },
        });

        return {
          items: rows.map((i) => ({
            id: i.id,
            employeeId: i.employeeId,
            employeeName: i.employee?.name ?? null,
            type: i.type,
            description: i.description,
            grossAmount: i.grossAmount,
            taxAmount: i.taxAmount,
            deductions: i.deductions,
            netAmount: i.netAmount,
            preTaxDeductions: i.preTaxDeductions,
            postTaxDeductions: i.postTaxDeductions,
            overtimeHours: i.overtimeHours,
            overtimeAmount: i.overtimeAmount,
            currency: i.currency,
            employeeTaxBreakdown: i.taxBreakdowns.map((t) => ({
              jurisdictionLevel: t.jurisdictionLevel,
              jurisdiction: t.jurisdiction,
              taxKind: t.taxKind,
              amount: t.amount,
            })),
            employerTaxBreakdown: i.employerTaxBreakdowns.map((t) => ({
              jurisdictionLevel: t.jurisdictionLevel,
              jurisdiction: t.jurisdiction,
              taxKind: t.taxKind,
              amount: t.amount,
            })),
          })),
        };
      })
  );

  // ─── Leave ────────────────────────────────────────────────────────
  server.tool(
    "get_employee_leave_balances",
    "Get an employee's leave/PTO balances by policy. Balances are in hours (balance = available, usedHours = taken) for the policy year. Returns one entry per leave policy the employee accrues against.",
    {
      employeeId: z.string().describe("UUID of the payroll employee"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:leave");

        const emp = await db.query.payrollEmployee.findFirst({
          where: and(
            eq(payrollEmployee.id, params.employeeId),
            eq(payrollEmployee.organizationId, ctx.organizationId),
            notDeleted(payrollEmployee.deletedAt)
          ),
        });
        if (!emp) throw new Error("Employee not found");

        const balances = await db.query.employeeLeaveBalance.findMany({
          where: eq(employeeLeaveBalance.employeeId, params.employeeId),
          with: { policy: true },
        });

        return {
          balances: balances.map((b) => ({
            id: b.id,
            policyId: b.policyId,
            policyName: b.policy?.name ?? null,
            leaveType: b.policy?.leaveType ?? null,
            year: b.year,
            balance: b.balance,
            usedHours: b.usedHours,
          })),
        };
      })
  );

  // ─── Tax Forms ────────────────────────────────────────────────────
  server.tool(
    "generate_tax_forms",
    "Generate year-end tax forms for a tax year. formType 'w2' produces one W-2 per employee from completed payroll runs (wages/tax in integer cents). formType '1099_nec' produces a 1099-NEC for each contractor paid at least $600 (60000 cents) of 'paid' payments in the year. Creates a tax-form-generation batch plus the individual forms. Returns the generation record and the count of forms generated.",
    {
      taxYear: z.number().int().min(2020).max(2099).describe("Tax year (e.g. 2026)"),
      formType: z
        .enum(["1099_nec", "1099_misc", "w2"])
        .describe("Form type. 'w2' for employees, '1099_nec' for contractors."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");

        const mem = await db.query.member.findFirst({
          where: and(
            eq(member.organizationId, ctx.organizationId),
            eq(member.userId, ctx.userId)
          ),
        });

        const [generation] = await db
          .insert(taxFormGeneration)
          .values({
            organizationId: ctx.organizationId,
            taxYear: params.taxYear,
            formType: params.formType,
            status: "draft",
            createdBy: mem?.id || null,
          })
          .returning();

        const yearStart = `${params.taxYear}-01-01`;
        const yearEnd = `${params.taxYear + 1}-01-01`;
        const forms: (typeof taxForm.$inferSelect)[] = [];

        if (params.formType === "1099_nec") {
          const contractorTotals = await db
            .select({
              contractorId: contractorPayment.contractorId,
              totalAmount: sql<number>`COALESCE(SUM(${contractorPayment.amount}), 0)`.mapWith(Number),
            })
            .from(contractorPayment)
            .innerJoin(contractor, eq(contractorPayment.contractorId, contractor.id))
            .where(
              and(
                eq(contractor.organizationId, ctx.organizationId),
                eq(contractorPayment.status, "paid"),
                gte(contractorPayment.paidAt, new Date(yearStart)),
                lt(contractorPayment.paidAt, new Date(yearEnd))
              )
            )
            .groupBy(contractorPayment.contractorId);

          for (const ct of contractorTotals) {
            if (ct.totalAmount < 60000) continue;
            const c = await db.query.contractor.findFirst({ where: eq(contractor.id, ct.contractorId) });
            if (!c) continue;
            const [form] = await db
              .insert(taxForm)
              .values({
                generationId: generation.id,
                recipientType: "contractor",
                recipientId: c.id,
                recipientName: c.name,
                recipientTaxId: c.taxId,
                formType: "1099_nec",
                taxYear: params.taxYear,
                formData: {
                  box1_nonemployee_compensation: ct.totalAmount,
                  recipient_company: c.company,
                  recipient_email: c.email,
                },
                status: "generated",
              })
              .returning();
            forms.push(form);
          }
        } else if (params.formType === "w2") {
          const employeeTotals = await db
            .select({
              employeeId: payrollItem.employeeId,
              totalGross: sql<number>`COALESCE(SUM(${payrollItem.grossAmount}), 0)`.mapWith(Number),
              totalTax: sql<number>`COALESCE(SUM(${payrollItem.taxAmount}), 0)`.mapWith(Number),
              totalNet: sql<number>`COALESCE(SUM(${payrollItem.netAmount}), 0)`.mapWith(Number),
            })
            .from(payrollItem)
            .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
            .where(
              and(
                eq(payrollRun.organizationId, ctx.organizationId),
                eq(payrollRun.status, "completed"),
                gte(payrollRun.payPeriodStart, yearStart),
                lt(payrollRun.payPeriodEnd, yearEnd)
              )
            )
            .groupBy(payrollItem.employeeId);

          for (const et of employeeTotals) {
            const emp = await db.query.payrollEmployee.findFirst({
              where: eq(payrollEmployee.id, et.employeeId),
            });
            if (!emp) continue;
            const [form] = await db
              .insert(taxForm)
              .values({
                generationId: generation.id,
                recipientType: "employee",
                recipientId: emp.id,
                recipientName: emp.name,
                recipientTaxId: null,
                formType: "w2",
                taxYear: params.taxYear,
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
              })
              .returning();
            forms.push(form);
          }
        }

        await db
          .update(taxFormGeneration)
          .set({ status: "generated", generatedAt: new Date() })
          .where(eq(taxFormGeneration.id, generation.id));

        return {
          generation: { ...generation, status: "generated" },
          formsGenerated: forms.length,
        };
      })
  );

  // ─── Tax Remittance ───────────────────────────────────────────────
  server.tool(
    "record_payroll_tax_remittance",
    "Record a remittance of withheld + employer payroll taxes to a tax authority for a period, posting a balanced journal entry that DEBITS the payroll-tax liability account (e.g. income-tax-payable 2220 for income tax, payroll-taxes-payable 2235 for FICA/FUTA/SUTA) and CREDITS the bank account, then marks the remittance 'paid'. 'amount' is the total cash remitted in integer cents. Provide the bankAccountId (a chart-of-accounts account id). Returns the remittance record and the posted journalEntryId.",
    {
      periodStart: z.string().min(1).describe("Start of the period this remittance covers (YYYY-MM-DD)"),
      periodEnd: z.string().min(1).describe("End of the period this remittance covers (YYYY-MM-DD)"),
      amount: z.number().int().min(1).describe("Total cash remitted, in integer cents"),
      bankAccountId: z.string().describe("UUID of the chart-of-accounts bank/cash account the remittance is paid from"),
      taxKind: z
        .string()
        .optional()
        .describe("What this covers, e.g. '941' (FIT+FICA), '940' (FUTA), 'state_income'. Determines the liability account debited."),
      jurisdictionLevel: z
        .enum(["federal", "state", "local"])
        .optional()
        .default("federal")
        .describe("Tax jurisdiction level"),
      jurisdiction: z.string().optional().describe("Jurisdiction code (e.g. 'CA', 'NY'); omit for federal"),
      reference: z.string().optional().describe("Confirmation / EFTPS number"),
      notes: z.string().optional().describe("Optional notes"),
      date: z.string().optional().describe("Posting/payment date (YYYY-MM-DD); defaults to periodEnd"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");

        const bank = await db.query.chartAccount.findFirst({
          where: and(
            eq(chartAccount.id, params.bankAccountId),
            eq(chartAccount.organizationId, ctx.organizationId),
            notDeleted(chartAccount.deletedAt)
          ),
        });
        if (!bank) throw new Error("Bank account not found");

        // Decide which liability account to debit based on what the remittance
        // covers. Income-tax style → 2220; FICA / unemployment style → 2235.
        const kind = (params.taxKind ?? "").toLowerCase();
        const isPayrollTax =
          kind.includes("fica") ||
          kind.includes("social") ||
          kind.includes("medicare") ||
          kind.includes("futa") ||
          kind.includes("suta") ||
          kind.includes("940") ||
          kind.includes("unemployment");
        const liabilityCode = isPayrollTax ? "2235" : "2220";

        const liabilityAccount = await findAccountByCode(ctx.organizationId, liabilityCode);
        if (!liabilityAccount) {
          throw new Error(
            `Payroll liability account ${liabilityCode} not found. Run a payroll first to create it.`
          );
        }

        const postingDate = params.date || params.periodEnd;

        const mem = await db.query.member.findFirst({
          where: and(
            eq(member.organizationId, ctx.organizationId),
            eq(member.userId, ctx.userId)
          ),
        });

        const result = await db.transaction(async (tx) => {
          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const [entry] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: postingDate,
              description: `Payroll tax remittance${params.taxKind ? ` (${params.taxKind})` : ""} ${params.periodStart} to ${params.periodEnd}`,
              reference: params.reference || null,
              status: "posted",
              sourceType: "payroll_tax_payment",
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();

          await tx.insert(journalLine).values([
            {
              journalEntryId: entry.id,
              accountId: liabilityAccount.id,
              description: "Payroll tax liability settled",
              debitAmount: params.amount,
              creditAmount: 0,
            },
            {
              journalEntryId: entry.id,
              accountId: bank.id,
              description: "Payroll tax remittance",
              debitAmount: 0,
              creditAmount: params.amount,
            },
          ]);

          const [payment] = await tx
            .insert(payrollTaxPayment)
            .values({
              organizationId: ctx.organizationId,
              periodStart: params.periodStart,
              periodEnd: params.periodEnd,
              jurisdictionLevel: params.jurisdictionLevel,
              jurisdiction: params.jurisdiction || null,
              taxKind: params.taxKind || null,
              amount: params.amount,
              currency: bank.currencyCode,
              bankAccountId: bank.id,
              reference: params.reference || null,
              notes: params.notes || null,
              status: "paid",
              paidAt: new Date(),
              journalEntryId: entry.id,
              createdBy: mem?.id || null,
            })
            .returning();

          return { payment, journalEntryId: entry.id };
        });

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "record_payroll_tax_remittance",
          entityType: "payroll_tax_payment",
          entityId: result.payment.id,
          changes: { amount: params.amount, journalEntryId: result.journalEntryId },
        });

        return { payment: result.payment, journalEntryId: result.journalEntryId };
      })
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  payrollEmployee,
  payrollRun,
  payrollItem,
  payrollSettings,
  employeeLeaveBalance,
  payslip,
  payrollTaxPayment,
  chartAccount,
  journalEntry,
  journalLine,
  member,
  auditLog,
} from "@/lib/db/schema";
import { eq, and, desc, sql, ne } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { generateTaxForms } from "@/lib/api/tax-form-builder";
import { buildRegularRunItems, insertPayItems, sumRunTotals } from "@/lib/api/payroll-run-builder";
import { processPayrollRun } from "@/lib/api/payroll-run-actions";
import { generateRunPayslips } from "@/lib/api/payslips";
import { syncLeaveBalances } from "@/lib/api/leave-balances";
import { incomeTaxAccountCode } from "@/lib/api/payroll-tax-liabilities";
import {
  getNextEntryNumber,
  findAccountByCode,
  ensureAccountByCode,
} from "@/lib/api/journal-automation";
import type { AuthContext } from "@/lib/api/auth-context";
import { checkEmployeeLimit } from "@/lib/api/check-limit";

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
            memberId: e.memberId,
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
        await checkEmployeeLimit(ctx.organizationId);

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
    "Create a draft regular payroll run for a pay period. Auto-generates a pay item for every active salaried/hourly employee employed in the period: salaried gross = salary / pay periods (less approved unpaid leave); hourly gross = hours on approved timesheets dated in the period, with overtime above the weekly threshold (payroll settings) and shift premiums, or standard hours (40 a week) when there is no approved timesheet. Each employee's assigned deductions are withheld (pre-tax ones lower taxable pay), then income tax (federal, plus state/local when brackets exist for the employee's state/local code; flat taxRate fallback when no federal brackets) and employee FICA, plus employer FICA/FUTA/SUTA. Persists the run, items and per-item tax, employer-tax and deduction lines. All amounts are integer cents; totalDeductions includes tax. The run is 'draft' and NOT yet posted: call process_payroll_run to post and complete it. Returns the created run.",
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

        if (params.payPeriodEnd < params.payPeriodStart) {
          throw new Error("The pay period end must be on or after its start");
        }
        // Same calculation as the REST route: see lib/api/payroll-run-builder.
        const { items, employeeCount } = await buildRegularRunItems(
          ctx.organizationId,
          params.payPeriodStart,
          params.payPeriodEnd
        );
        if (employeeCount === 0) throw new Error("No active employees found");
        if (items.length === 0) throw new Error("No payable employees found for this period");

        const { totalGross, totalDeductions, totalNet } = sumRunTotals(items.map((i) => i.columns));

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
          await insertPayItems(tx, createdRun.id, items);
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
    "Process (finish and post) a draft payroll run: posts ONE balanced journal entry (DR gross wages 5100 + employer payroll taxes 5120; CR income tax payable 2220, payroll taxes payable 2235, pension & benefits 2245, other deductions 2236; CR take-home pay to the bank account, or Wages Payable 2310 when accrued) and marks the run 'completed', atomically, then refreshes leave balances. Refused when the org has an active approval chain and the run isn't signed off (unless auto-approve is on), or when the period end is in a locked period. Amounts are integer cents. Returns the run and the posted journalEntryId.",
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

        // Same rules as the REST route: drafts only, sign-off required when an
        // approval chain is active (unless auto-approve is on), period lock.
        const { items: _items, ...updated } = await processPayrollRun(ctx, params.payRunId, { accrued: params.accrued });
        void _items;

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "process_payroll_run",
          entityType: "payroll_run",
          entityId: params.payRunId,
          changes: { journalEntryId: updated.journalEntryId },
        });

        return { run: updated, journalEntryId: updated.journalEntryId };
      })
  );

  server.tool(
    "generate_payslips",
    "Generate payslips for a COMPLETED payroll run: one per pay item that doesn't have one yet (safe to call twice, no duplicates). Each payslip has the itemised taxes and deductions and the employee's year-to-date gross/net/tax for the calendar year (integer cents). Call after process_payroll_run. Returns { count: created, alreadyGenerated }.",
    {
      payRunId: z.string().describe("UUID of the completed payroll run to generate payslips for"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");

        const result = await generateRunPayslips(ctx.organizationId, params.payRunId);

        await db.insert(auditLog).values({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: "generate_payslips",
          entityType: "payroll_run",
          entityId: params.payRunId,
          changes: { count: result.count },
        });

        return result;
      })
  );

  server.tool(
    "get_payslip_pdf",
    "Render one payslip as a PDF using the organization's default Payslip document template (logo, accent colour, header/footer text, notes; Show Tax Breakdown lists each tax separately). Returns the PDF base64-encoded with its filename and MIME type, plus the API download URL. Amounts printed are converted from integer cents.",
    {
      payslipId: z.string().describe("UUID of the payslip (from list_payslips)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const { loadPayslipPdfData } = await import("@/lib/documents/payslip-pdf");
        const { getDefaultTemplate, loadOrgInfo } = await import("@/lib/documents/templates");
        const { renderPayslipPdf } = await import("@/lib/documents/pdf-renderer");
        const loaded = await loadPayslipPdfData(params.payslipId, ctx.organizationId);
        if (!loaded) throw new Error("Payslip not found");
        const template = (await getDefaultTemplate(ctx.organizationId, "payslip")) || {};
        const pdf = await renderPayslipPdf(loaded.slip, await loadOrgInfo(ctx.organizationId), template);
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        return {
          filename: loaded.fileName,
          mimeType: "application/pdf",
          base64: Buffer.from(pdf).toString("base64"),
          downloadUrl: `${baseUrl}/api/v1/payroll/payslips/${params.payslipId}/pdf?format=pdf`,
        };
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
    "Get an employee's leave/PTO balances for the current year, one per active leave policy. Balances are recalculated first: carried over + accrued so far (per the policy's method and rate) − approved leave, capped at the policy max. Hours (balance = available, usedHours = approved leave taken).",
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

        await syncLeaveBalances(ctx.organizationId, { employeeIds: [emp.id] });
        const balances = await db.query.employeeLeaveBalance.findMany({
          where: and(
            eq(employeeLeaveBalance.employeeId, params.employeeId),
            eq(employeeLeaveBalance.year, new Date().getFullYear())
          ),
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
    "Generate year-end tax forms for a tax year. formType 'w2' produces one W-2 per employee from completed (not void or deleted) payroll runs whose pay period ends in the year: Box 1 = gross minus pre-tax deductions; Box 2/4/6 and state/local Boxes 16-19 from the actual withholding; Box 3 capped at the Social Security wage base; Box 12/14 from itemized deductions. formType '1099_nec' produces a 1099-NEC for each contractor paid at least $600 (60000 cents) of 'paid' payments in the year. '1099_misc' is not supported yet. Generating the same form type and year again replaces the previous batch. All amounts in integer cents. Returns the generation record, formsGenerated and replacedPrevious.",
    {
      taxYear: z.number().int().min(2020).max(2099).describe("Tax year (e.g. 2026)"),
      formType: z
        .enum(["1099_nec", "1099_misc", "w2"])
        .describe("Form type. 'w2' for employees, '1099_nec' for contractors."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        // Same calculation as POST /api/v1/payroll/tax-forms/generate
        return generateTaxForms(ctx, params);
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
        const remittanceSettings = await db.query.payrollSettings.findFirst({
          where: eq(payrollSettings.organizationId, ctx.organizationId),
        });
        // Income tax clears the account payroll runs credit it to (the payroll
        // settings' income-tax account when one is set, else 2220).
        const liabilityCode = isPayrollTax
          ? "2235"
          : incomeTaxAccountCode(remittanceSettings?.taxPayableAccountCode);

        // Connect the payroll liability account on demand — an org that hasn't
        // run a payroll yet won't have it — so a remittance never dead-ends. The
        // REST sibling (payroll/tax-payments) does the same; names match the chart.
        const PAYROLL_LIABILITY_NAMES: Record<string, string> = {
          "2220": "Income Tax Payable",
          "2235": "Payroll Taxes Payable",
          "2245": "Pension & Benefits Payable",
        };
        const baseCurrency = remittanceSettings?.defaultCurrency ?? "USD";
        const liabilityAccount =
          (await findAccountByCode(ctx.organizationId, liabilityCode)) ??
          (await ensureAccountByCode(
            ctx.organizationId,
            {
              code: liabilityCode,
              name: PAYROLL_LIABILITY_NAMES[liabilityCode] ?? `Account ${liabilityCode}`,
              type: "liability",
              subType: "current",
            },
            baseCurrency
          ));
        if (!liabilityAccount) {
          throw new Error(`Could not resolve payroll liability account ${liabilityCode}`);
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

  server.tool(
    "list_workspace_members",
    "List the people who can log in to this workspace: member id, name, email and role (no passwords or other account data). Use a member id with link_employee_to_member.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const rows = await db.query.member.findMany({
          where: eq(member.organizationId, ctx.organizationId),
          columns: { id: true, role: true },
          with: { user: { columns: { name: true, email: true } } },
        });
        return { members: rows.map((m) => ({ id: m.id, name: m.user?.name ?? null, email: m.user?.email ?? null, role: m.role })) };
      })
  );

  server.tool(
    "link_employee_to_member",
    "Link a payroll employee to the workspace member (login) who is that person, so they can use Employee self-service to see their payslips, leave and timesheets. Pass memberId null to unlink. A member can be linked to only one employee. Use list_workspace_members to find memberId. Requires manage:payroll. Returns the employee's id, name and memberId.",
    {
      employeeId: z.string().uuid().describe("UUID of the payroll employee"),
      memberId: z.string().uuid().nullable().describe("UUID of the workspace member to link, or null to unlink"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:payroll");
        const emp = await db.query.payrollEmployee.findFirst({
          where: and(eq(payrollEmployee.id, params.employeeId), eq(payrollEmployee.organizationId, ctx.organizationId), notDeleted(payrollEmployee.deletedAt)),
          columns: { id: true },
        });
        if (!emp) throw new Error("Employee not found");
        if (params.memberId) {
          const m = await db.query.member.findFirst({
            where: and(eq(member.id, params.memberId), eq(member.organizationId, ctx.organizationId)),
            columns: { id: true },
          });
          if (!m) throw new Error("That person isn't a member of this workspace");
          const taken = await db.query.payrollEmployee.findFirst({
            where: and(
              eq(payrollEmployee.organizationId, ctx.organizationId),
              eq(payrollEmployee.memberId, params.memberId),
              ne(payrollEmployee.id, emp.id),
              notDeleted(payrollEmployee.deletedAt)
            ),
            columns: { name: true },
          });
          if (taken) throw new Error(`That member is already linked to ${taken.name}`);
        }
        const [updated] = await db
          .update(payrollEmployee)
          .set({ memberId: params.memberId, updatedAt: new Date() })
          .where(eq(payrollEmployee.id, emp.id))
          .returning({ id: payrollEmployee.id, name: payrollEmployee.name, memberId: payrollEmployee.memberId });
        return { employee: updated };
      })
  );
}

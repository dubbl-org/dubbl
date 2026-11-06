import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { taxPeriod } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import { fileTaxPeriod } from "@/lib/reports/tax-filing";
import {
  boxTransactions,
  computeBas,
  computeVatReturn,
  getOrgTaxConfig,
  isDrillableBox,
  resolveBasis,
} from "@/lib/reports/tax-return";
import { computeSalesTaxReport } from "@/lib/reports/sales-tax-report";
import { filingDeadline } from "@/lib/tax/filing-deadline";
import { buildScheduleC } from "@/lib/tax/schedule-c";
import { aggregateByDateRange } from "@/lib/reports/gl-query";
import { organization } from "@/lib/db/schema";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for VAT/GST tax periods — the filing-tracking records that group a
 * date range (e.g. "Q1 2026") for a VAT return. Mirrors the REST routes under
 * app/api/v1/tax-periods (list/get/create + the [id]/file flow).
 *
 * The taxPeriod table has no soft-delete, so queries are org-scoped only.
 * All monetary amounts — both INPUTS and RESULTS — are integer cents (e.g.
 * $12.50 = 1250). Direct DB access via Drizzle (no HTTP self-calls); org-scoped
 * via the AuthContext.
 *
 * Note: the cash settlement of a filed return (paying/refunding the authority)
 * lives in the `record_vat_settlement` tool; this file does not duplicate it.
 */
export function registerTaxPeriodTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_tax_periods",
    "List the organization's VAT/GST tax periods (filing-tracking records), newest start date first, each with its frozen return lines (box figures) and its filing deadline `dueDate` (YYYY-MM-DD, worked out from the period end and the organization's country: UK one month and 7 days after; Australia the 21st or 28th of the next month, December quarter 28 February; US the 20th of the next month; otherwise the end of the next month). Tax-return line amounts are in integer cents in `currency`. Returns { currency, taxPeriods }.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const periods = await db.query.taxPeriod.findMany({
          where: eq(taxPeriod.organizationId, ctx.organizationId),
          orderBy: desc(taxPeriod.startDate),
          with: { lines: true },
        });
        const config = await getOrgTaxConfig(ctx.organizationId);

        return {
          currency: config.baseCurrency,
          taxPeriods: periods.map((p) => ({
            ...p,
            dueDate: filingDeadline(p.endDate, config.country, p.type),
          })),
        };
      })
  );

  server.tool(
    "get_tax_period",
    "Get a single VAT/GST tax period by ID, including its frozen return lines (box figures) and its filing deadline `dueDate` (YYYY-MM-DD). Tax-return line amounts are in integer cents in `currency`. Returns { currency, taxPeriod }.",
    {
      taxPeriodId: z.string().describe("The UUID of the tax period"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.taxPeriod.findFirst({
          where: and(
            eq(taxPeriod.id, params.taxPeriodId),
            eq(taxPeriod.organizationId, ctx.organizationId)
          ),
          with: { lines: true },
        });
        if (!found) throw new Error("Tax period not found");
        const config = await getOrgTaxConfig(ctx.organizationId);
        return {
          currency: config.baseCurrency,
          taxPeriod: { ...found, dueDate: filingDeadline(found.endDate, config.country, found.type) },
        };
      })
  );

  server.tool(
    "create_tax_period",
    "Create a VAT/GST tax period (a filing-tracking record for a date range). The period starts in 'open' status and can later be filed. Returns the created tax period.",
    {
      name: z
        .string()
        .min(1)
        .describe("Display name for the period, e.g. 'Q1 2026'."),
      startDate: z
        .string()
        .min(1)
        .describe("Period start date in YYYY-MM-DD."),
      endDate: z
        .string()
        .min(1)
        .describe("Period end date in YYYY-MM-DD."),
      type: z
        .enum(["monthly", "quarterly", "annual"])
        .describe("Filing frequency of the period: 'monthly', 'quarterly', or 'annual'."),
      notes: z
        .string()
        .optional()
        .describe("Optional free-text notes for the period."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:tax-config");

        const [created] = await db
          .insert(taxPeriod)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            startDate: params.startDate,
            endDate: params.endDate,
            type: params.type,
            notes: params.notes,
          })
          .returning();

        return { taxPeriod: created };
      })
  );

  server.tool(
    "file_tax_period",
    "File an open VAT/GST tax period. Computes the return on the chosen basis (defaults to the org's vatScheme: 'accrual' recognises VAT on the document date; 'cash' recognises invoices and bills pro rata to the payments made in the period), FREEZES the figures into the period's return lines (all nine VAT boxes 1-9, Box 2 reverse-charge VAT included; or the BAS fields G1, G2, G3, G10, G11, 1A, 1B and NET for an Australian organization) so the filed numbers are auditable and do not drift if entries are later backdated into the period, and posts the VAT-return clearing journal entry against those SAME figures: debits Output VAT (2200) by Box 3 / 1A, credits Input VAT (1500) by Box 4 / 1B, and books the net to the VAT Suspense / return-clearing account (2240): credit when payable to the authority, debit when it's a refund. On the cash basis VAT on unpaid invoices and bills stays in 2200/1500 for the period it is paid in. Marks the period filed (only an open period can be filed). Returns the clearing journalEntryId, the basis used, the net amount in integer cents (positive = payable to authority, negative = refund), the output/input VAT cleared in integer cents, and the frozen lines. All amounts are in integer cents. (To record the cash payment/refund of a filed return, use record_vat_settlement.)",
    {
      taxPeriodId: z
        .string()
        .describe("UUID of the open tax period to file."),
      filedReference: z
        .string()
        .optional()
        .describe("Optional filing reference number from the tax authority."),
      basis: z
        .enum(["accrual", "cash"])
        .optional()
        .describe("Basis for the frozen figures: 'accrual' or 'cash'. Defaults to the organization's vatScheme."),
      flatRatePercent: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional flat-rate percentage in basis points (1450 = 14.50%) for the UK flat-rate scheme. When supplied, Box 1 is frozen as that percentage of VAT-inclusive turnover, Box 4 as 0, and nothing is cleared from 2200/1500."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:tax-config");

        // Shared with the REST file route (app/api/v1/tax-periods/[id]/file),
        // so the frozen figures match the live VAT return / BAS report.
        const filed = await fileTaxPeriod(ctx, params.taxPeriodId, {
          basis: params.basis,
          flatRatePercent: params.flatRatePercent ?? null,
          filedReference: params.filedReference ?? null,
        });

        return {
          taxPeriod: filed.taxPeriod,
          clearingJournalEntryId: filed.clearingJournalEntryId,
          net: filed.net,
          outputVat: filed.outputVat,
          inputVat: filed.inputVat,
          basis: filed.basis,
          filedLines: filed.filedLines,
        };
      })
  );

  server.tool(
    "delete_tax_period",
    "Delete an open VAT/GST tax period. Submitted (filed) periods cannot be deleted. Returns { deleted: true, taxPeriodId }.",
    {
      taxPeriodId: z.string().describe("UUID of the open tax period to delete."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:tax-config");
        const found = await db.query.taxPeriod.findFirst({
          where: and(
            eq(taxPeriod.id, params.taxPeriodId),
            eq(taxPeriod.organizationId, ctx.organizationId)
          ),
        });
        if (!found) throw new Error("Tax period not found");
        if (found.status !== "open") throw new Error("Only open tax periods can be deleted");
        await db
          .delete(taxPeriod)
          .where(and(eq(taxPeriod.id, found.id), eq(taxPeriod.organizationId, ctx.organizationId)));
        return { deleted: true, taxPeriodId: found.id };
      })
  );

  server.tool(
    "vat_return_report",
    "Run the UK-style nine-box VAT return for a date range (read only, nothing is filed). Box 1 output VAT on sales, Box 2 VAT on reverse-charge purchases, Box 3 = 1 + 2, Box 4 input VAT reclaimed, Box 5 net (positive = payable, negative = refund), Boxes 6 and 7 sales and purchases excluding VAT, Boxes 8 and 9 the cross-border part. Basis 'accrual' counts documents on their date; 'cash' counts invoices and bills pro rata to the payments made in the range. All amounts are integer cents in `currency`. Returns { boxes, basis, vatScheme, currency, period }.",
    {
      startDate: z.string().describe("Start date (YYYY-MM-DD), inclusive."),
      endDate: z.string().describe("End date (YYYY-MM-DD), inclusive."),
      basis: z
        .enum(["accrual", "cash"])
        .optional()
        .describe("'accrual' or 'cash'. Defaults to the organization's VAT scheme."),
      flatRatePercent: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("UK flat-rate percentage in basis points (1450 = 14.50%). When set, Box 1 is that percentage of VAT-inclusive turnover and Box 4 is 0."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        const config = await getOrgTaxConfig(ctx.organizationId);
        const basis = resolveBasis(params.basis, config);
        const { boxes } = await computeVatReturn(ctx.organizationId, params.startDate, params.endDate, basis, {
          flatRatePercent: params.flatRatePercent ?? null,
          config,
        });
        return {
          boxes,
          basis,
          vatScheme: config.vatScheme,
          currency: config.baseCurrency,
          period: { startDate: params.startDate, endDate: params.endDate },
        };
      })
  );

  server.tool(
    "bas_report",
    "Run the Australian Business Activity Statement (GST) for a date range (read only, nothing is lodged). Fields: G1 total sales including GST, G2 export sales, G3 other GST-free sales, G10 capital purchases including GST, G11 other purchases including GST, 1A GST on sales, 1B GST on purchases, NET = 1A - 1B (positive = payable, negative = refund). Basis 'accrual' counts documents on their date; 'cash' counts invoices and bills pro rata to the payments made in the range. All amounts are integer cents in `currency`. Returns { fields, basis, vatScheme, currency, period }.",
    {
      startDate: z.string().describe("Start date (YYYY-MM-DD), inclusive."),
      endDate: z.string().describe("End date (YYYY-MM-DD), inclusive."),
      basis: z
        .enum(["accrual", "cash"])
        .optional()
        .describe("'accrual' or 'cash'. Defaults to the organization's GST scheme."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        const config = await getOrgTaxConfig(ctx.organizationId);
        const basis = resolveBasis(params.basis, config);
        const { fields } = await computeBas(ctx.organizationId, params.startDate, params.endDate, basis, config);
        return {
          fields,
          basis,
          vatScheme: config.vatScheme,
          currency: config.baseCurrency,
          period: { startDate: params.startDate, endDate: params.endDate },
        };
      })
  );

  server.tool(
    "vat_box_transactions",
    "List the ledger lines behind one VAT return or BAS box for a date range, so a figure can be checked line by line. Supported boxes: '1' (output VAT, reverse charge excluded), '2' (reverse-charge VAT), '4' (input VAT), '1A' (GST on sales), '1B' (GST on purchases). On the cash basis each part payment shows as its own row for the share of the document it settled. Amounts are integer cents; the sum of `amount` equals the box. Returns { box, basis, total, count, transactions }.",
    {
      box: z.enum(["1", "2", "4", "1A", "1B"]).describe("The box to explain: '1', '2', '4' (VAT) or '1A', '1B' (BAS)."),
      taxPeriodId: z
        .string()
        .optional()
        .describe("UUID of a tax period whose dates to use. Give this or startDate and endDate."),
      startDate: z.string().optional().describe("Start date (YYYY-MM-DD), inclusive. Required without taxPeriodId."),
      endDate: z.string().optional().describe("End date (YYYY-MM-DD), inclusive. Required without taxPeriodId."),
      basis: z
        .enum(["accrual", "cash"])
        .optional()
        .describe("'accrual' or 'cash'. Defaults to the organization's VAT/GST scheme."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        if (!isDrillableBox(params.box)) throw new Error("This box has no ledger lines behind it");
        let startDate = params.startDate ?? "";
        let endDate = params.endDate ?? "";
        if (params.taxPeriodId) {
          const period = await db.query.taxPeriod.findFirst({
            where: and(
              eq(taxPeriod.id, params.taxPeriodId),
              eq(taxPeriod.organizationId, ctx.organizationId)
            ),
            columns: { startDate: true, endDate: true },
          });
          if (!period) throw new Error("Tax period not found");
          startDate = period.startDate;
          endDate = period.endDate;
        }
        if (!startDate || !endDate) throw new Error("Give taxPeriodId, or startDate and endDate");
        const config = await getOrgTaxConfig(ctx.organizationId);
        const basis = resolveBasis(params.basis, config);
        const transactions = await boxTransactions(ctx.organizationId, params.box, startDate, endDate, basis);
        return {
          box: params.box,
          basis,
          period: { startDate, endDate },
          total: transactions.reduce((s, t) => s + t.amount, 0),
          count: transactions.length,
          transactions,
        };
      })
  );

  server.tool(
    "sales_tax_report",
    "Run the sales tax report for a date range: tax collected on invoices issued and cash sales (sales receipts) made in the range, less credit notes issued in it, grouped by tax rate and converted to the base currency. Lines with no tax rate, an exempt or no-tax rate, or a customer marked \"Don't charge tax\" count only as exempt sales, never in the by-rate breakdown. All amounts are integer cents in `currency`. Returns { breakdown (per rate: taxableAmount, taxCollected, invoiceCount = number of documents), exemptAmount, exemptCustomerAmount, totalTaxable, totalCollected, invoiceCount, documentCounts { invoices, salesReceipts, creditNotes }, currency, period }.",
    {
      startDate: z.string().describe("Start date (YYYY-MM-DD), inclusive."),
      endDate: z.string().describe("End date (YYYY-MM-DD), inclusive."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        return computeSalesTaxReport(ctx.organizationId, params.startDate, params.endDate);
      })
  );

  server.tool(
    "schedule_c_report",
    "Run the IRS Schedule C (Form 1040) worksheet for a date range (a tax prep worksheet, not a filing). Revenue and expense accounts are mapped to Schedule C lines by sub type, type and name: Line 1 gross receipts, Line 2 returns and allowances, Line 3 = 1 - 2, Line 4 cost of goods sold, Line 5 gross profit, Line 6 other income, Line 7 gross income, Lines 8 to 27a expenses, Line 28 total expenses, Line 29 / 31 net profit. Income tax, unrealised currency movements and gains or losses on selling assets are left out. Each line lists the accounts behind it. All amounts are integer cents in `currency`. Returns { lines, totalIncome, totalExpenses, netProfit, basis, currency }.",
    {
      startDate: z.string().describe("Start date (YYYY-MM-DD), inclusive. Usually January 1."),
      endDate: z.string().describe("End date (YYYY-MM-DD), inclusive. Usually December 31."),
      basis: z
        .enum(["accrual", "cash"])
        .optional()
        .describe("Accounting method: 'accrual' (default) or 'cash' (invoices and bills count when paid)."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "view:data");
        const basis = params.basis ?? "accrual";
        const [accounts, org] = await Promise.all([
          aggregateByDateRange(
            ctx.organizationId,
            { startDate: params.startDate, endDate: params.endDate },
            { basis, accountTypes: ["revenue", "expense"] }
          ),
          db.query.organization.findFirst({
            where: eq(organization.id, ctx.organizationId),
            columns: { defaultCurrency: true },
          }),
        ]);
        return { ...buildScheduleC(accounts), basis, currency: org?.defaultCurrency ?? "USD" };
      })
  );
}

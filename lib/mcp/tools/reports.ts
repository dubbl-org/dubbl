import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  chartAccount,
  journalLine,
  journalEntry,
  invoice,
  invoiceLine,
  contact,
  inventoryItem,
  costCenter,
  project,
  bill,
  organization,
} from "@/lib/db/schema";
import { eq, and, sql, isNull, ne, gte, lte, inArray, asc } from "drizzle-orm";
import { centsToDecimal } from "@/lib/money";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";
import type { Statement } from "@/lib/reports/statement-export";
import {
  aggregateAsAt,
  aggregateByDateRange,
  aggregateByDimension,
  type AccountAggregate,
  type Dimension,
  type DimensionGroup,
  type ReportBasis,
} from "@/lib/reports/gl-query";

/** Normalize a basis string to the gl-query ReportBasis ('accrual' default). */
function parseBasis(value: string | undefined): ReportBasis {
  return value === "cash" ? "cash" : "accrual";
}

/**
 * Resolve a single optional dimension filter from costCenterId / projectId.
 * costCenterId takes precedence. The literal "none" / "null" / "" matches lines
 * where the dimension is unset (IS NULL). Returns undefined when neither is set.
 */
function resolveDimensionFilter(args: {
  costCenterId?: string;
  projectId?: string;
}): { dimension: Dimension; dimensionValue: string | null } | undefined {
  let dimension: Dimension | undefined;
  let raw: string | undefined;
  if (args.costCenterId !== undefined) {
    dimension = "costCenterId";
    raw = args.costCenterId;
  } else if (args.projectId !== undefined) {
    dimension = "projectId";
    raw = args.projectId;
  }
  if (!dimension) return undefined;
  const dimensionValue =
    raw === "none" || raw === "null" || raw === "" || raw === undefined
      ? null
      : raw;
  return { dimension, dimensionValue };
}

export function registerReportTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "trial_balance",
    "Generate a trial balance report showing all accounts with their cumulative debit and credit balances from posted entries as at a date. Balances are returned as decimal strings. Pass asAt to choose the point in time (defaults to today) and compareDates to add prior-date comparative columns.",
    {
      asAt: z
        .string()
        .optional()
        .describe(
          "Cumulative balance date (YYYY-MM-DD). Includes all posted history up to and including this date. Defaults to today."
        ),
      compareDates: z
        .array(z.string())
        .optional()
        .describe(
          "Optional prior dates (YYYY-MM-DD) to add as comparative columns. Each produces an extra per-account balance aligned to `dates`."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const asAt = params.asAt ?? new Date().toISOString().slice(0, 10);
        const seen = new Set<string>([asAt]);
        const compareDates = (params.compareDates ?? []).filter((d) => {
          if (seen.has(d)) return false;
          seen.add(d);
          return true;
        });
        const allDates = [asAt, ...compareDates];
        const hasComparatives = compareDates.length > 0;

        const perDate = await Promise.all(
          allDates.map((date) =>
            aggregateAsAt(ctx.organizationId, date, {
              includeEmptyAccounts: true,
            })
          )
        );
        const byDate = perDate.map((accounts) => {
          const m = new Map<string, AccountAggregate>();
          for (const a of accounts) m.set(a.accountId, a);
          return m;
        });
        const primary = perDate[0];

        const splitDebitCredit = (cents: number) => ({
          debitBalance: cents > 0 ? centsToDecimal(cents) : "0.00",
          creditBalance: cents < 0 ? centsToDecimal(Math.abs(cents)) : "0.00",
          balance: centsToDecimal(cents),
        });

        const accounts = primary.map((a) => {
          const balances = byDate.map((m) => m.get(a.accountId)?.balance ?? 0);
          return {
            accountId: a.accountId,
            code: a.code,
            name: a.name,
            type: a.type,
            ...splitDebitCredit(balances[0]),
            ...(hasComparatives
              ? { balances: balances.map((b) => splitDebitCredit(b)) }
              : {}),
          };
        });

        return {
          asAt,
          ...(hasComparatives ? { dates: allDates, compareDates } : {}),
          accounts,
        };
      })
  );

  server.tool(
    "balance_sheet",
    "Generate a balance sheet report showing assets, liabilities, and equity with totals (cumulative balances as at a date). Only includes posted entries. Balances are decimal strings. Pass asAt to choose the point in time (defaults to today) and compareDates to add prior-date comparative columns.",
    {
      asAt: z
        .string()
        .optional()
        .describe(
          "Cumulative balance date (YYYY-MM-DD). Includes all posted history up to and including this date. Defaults to today."
        ),
      compareDates: z
        .array(z.string())
        .optional()
        .describe(
          "Optional prior dates (YYYY-MM-DD) to add as comparative columns. Each adds per-account `balances`/`totals` aligned to `dates`."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const asAt = params.asAt ?? new Date().toISOString().slice(0, 10);
        const seen = new Set<string>([asAt]);
        const compareDates = (params.compareDates ?? []).filter((d) => {
          if (seen.has(d)) return false;
          seen.add(d);
          return true;
        });
        const allDates = [asAt, ...compareDates];
        const hasComparatives = compareDates.length > 0;

        const perDate = await Promise.all(
          allDates.map((date) =>
            aggregateAsAt(ctx.organizationId, date, {
              accountTypes: ["asset", "liability", "equity"],
              includeEmptyAccounts: true,
            })
          )
        );
        const byDate = perDate.map((accounts) => {
          const m = new Map<string, AccountAggregate>();
          for (const a of accounts) m.set(a.accountId, a);
          return m;
        });
        const primary = perDate[0];

        function buildSection(type: AccountAggregate["type"]) {
          const accountsOfType = primary.filter((a) => a.type === type);
          const accts = accountsOfType.map((a) => {
            const balances = byDate.map(
              (m) => m.get(a.accountId)?.balance ?? 0
            );
            return {
              accountId: a.accountId,
              code: a.code,
              name: a.name,
              balance: centsToDecimal(balances[0]),
              ...(hasComparatives
                ? { balances: balances.map((b) => centsToDecimal(b)) }
                : {}),
            };
          });
          const totals = allDates.map((_, i) =>
            accountsOfType.reduce(
              (s, a) => s + (byDate[i].get(a.accountId)?.balance ?? 0),
              0
            )
          );
          return {
            type,
            accounts: accts,
            total: centsToDecimal(totals[0]),
            ...(hasComparatives
              ? { totals: totals.map((t) => centsToDecimal(t)) }
              : {}),
          };
        }

        return {
          asAt,
          ...(hasComparatives ? { dates: allDates, compareDates } : {}),
          assets: buildSection("asset"),
          liabilities: buildSection("liability"),
          equity: buildSection("equity"),
        };
      })
  );

  server.tool(
    "profit_and_loss",
    "Generate a profit and loss (income statement) report for a date range. Shows revenue and expense accounts with totals. Amounts are in integer cents. Supports cash vs accrual basis, an optional cost-center or project dimension filter, and an optional comparative period (compareFrom/compareTo).",
    {
      startDate: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD, defaults to Jan 1 of current year)"),
      endDate: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD, defaults to today)"),
      basis: z
        .enum(["accrual", "cash"])
        .optional()
        .describe(
          "Reporting basis: 'accrual' (default) counts all posted entries; 'cash' counts only cash/payment-realized movement."
        ),
      costCenterId: z
        .string()
        .optional()
        .describe(
          "Filter to lines tagged with this cost center (UUID). Pass 'none' to match lines with no cost center. Takes precedence over projectId."
        ),
      projectId: z
        .string()
        .optional()
        .describe(
          "Filter to lines tagged with this project (UUID). Pass 'none' to match lines with no project. Ignored if costCenterId is set."
        ),
      compareFrom: z
        .string()
        .optional()
        .describe(
          "Comparative period start (YYYY-MM-DD). Both compareFrom and compareTo must be set to add a `comparison` period."
        ),
      compareTo: z
        .string()
        .optional()
        .describe(
          "Comparative period end (YYYY-MM-DD). Both compareFrom and compareTo must be set to add a `comparison` period."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const startDate =
          params.startDate ?? `${new Date().getFullYear()}-01-01`;
        const endDate =
          params.endDate ?? new Date().toISOString().slice(0, 10);
        const basis = parseBasis(params.basis);
        const dim = resolveDimensionFilter(params);

        type PLAccount = {
          accountId: string;
          accountName: string;
          accountCode: string;
          balance: number;
        };
        type PLPeriod = {
          startDate: string;
          endDate: string;
          revenue: PLAccount[];
          totalRevenue: number;
          expenses: PLAccount[];
          totalExpenses: number;
          netIncome: number;
        };

        const toPeriod = (
          s: string,
          e: string,
          aggs: AccountAggregate[]
        ): PLPeriod => {
          const revenue: PLAccount[] = [];
          const expenses: PLAccount[] = [];
          for (const a of aggs) {
            // gl-query natural-signs: revenue = credit−debit, expense = debit−credit.
            const line: PLAccount = {
              accountId: a.accountId,
              accountName: a.name,
              accountCode: a.code,
              balance: a.balance,
            };
            if (a.type === "revenue") revenue.push(line);
            else if (a.type === "expense") expenses.push(line);
          }
          const totalRevenue = revenue.reduce((sum, r) => sum + r.balance, 0);
          const totalExpenses = expenses.reduce((sum, x) => sum + x.balance, 0);
          return {
            startDate: s,
            endDate: e,
            revenue,
            totalRevenue,
            expenses,
            totalExpenses,
            netIncome: totalRevenue - totalExpenses,
          };
        };

        const queryOpts = {
          basis,
          accountTypes: ["revenue", "expense"] as AccountAggregate["type"][],
          ...(dim
            ? { dimension: dim.dimension, dimensionValue: dim.dimensionValue }
            : {}),
        };

        const primaryAggs = await aggregateByDateRange(
          ctx.organizationId,
          { startDate, endDate },
          queryOpts
        );
        const primary = toPeriod(startDate, endDate, primaryAggs);

        const hasComparison = Boolean(params.compareFrom && params.compareTo);
        let comparison: PLPeriod | undefined;
        if (hasComparison) {
          const cmpAggs = await aggregateByDateRange(
            ctx.organizationId,
            { startDate: params.compareFrom!, endDate: params.compareTo! },
            queryOpts
          );
          comparison = toPeriod(
            params.compareFrom!,
            params.compareTo!,
            cmpAggs
          );
        }

        return {
          startDate,
          endDate,
          basis,
          ...(dim
            ? {
                dimension: dim.dimension,
                dimensionValue: dim.dimensionValue,
              }
            : {}),
          revenue: primary.revenue,
          totalRevenue: primary.totalRevenue,
          expenses: primary.expenses,
          totalExpenses: primary.totalExpenses,
          netIncome: primary.netIncome,
          ...(comparison ? { comparison } : {}),
        };
      })
  );

  server.tool(
    "aged_receivables",
    "Generate an aged receivables report showing outstanding invoices grouped by aging buckets (Current, 1-30, 31-60, 61-90, 90+ days). Amounts are in integer cents.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const invoices = await db.query.invoice.findMany({
          where: and(
            eq(invoice.organizationId, ctx.organizationId),
            isNull(invoice.deletedAt),
            ne(invoice.status, "void"),
            ne(invoice.status, "paid"),
            ne(invoice.status, "draft")
          ),
          with: { contact: true },
        });

        type InvoiceBucketItem = { id: string; invoiceNumber: string; contactName: string; dueDate: string; amountDue: number; daysOverdue: number };
        const today = new Date();
        const buckets: { label: string; total: number; count: number; invoices: InvoiceBucketItem[] }[] = [
          { label: "Current", total: 0, count: 0, invoices: [] },
          { label: "1-30 days", total: 0, count: 0, invoices: [] },
          { label: "31-60 days", total: 0, count: 0, invoices: [] },
          { label: "61-90 days", total: 0, count: 0, invoices: [] },
          { label: "90+ days", total: 0, count: 0, invoices: [] },
        ];

        for (const inv of invoices) {
          const due = new Date(inv.dueDate);
          const daysOverdue = Math.floor(
            (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
          );

          let bucketIdx: number;
          if (daysOverdue <= 0) bucketIdx = 0;
          else if (daysOverdue <= 30) bucketIdx = 1;
          else if (daysOverdue <= 60) bucketIdx = 2;
          else if (daysOverdue <= 90) bucketIdx = 3;
          else bucketIdx = 4;

          buckets[bucketIdx].invoices.push({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            contactName: inv.contact?.name ?? "Unknown",
            dueDate: inv.dueDate,
            amountDue: inv.amountDue,
            daysOverdue: Math.max(0, daysOverdue),
          });
          buckets[bucketIdx].total += inv.amountDue;
          buckets[bucketIdx].count += 1;
        }

        const grandTotal = buckets.reduce((sum, b) => sum + b.total, 0);
        return { buckets, grandTotal };
      })
  );

  server.tool(
    "aged_payables",
    "Generate an aged payables report showing outstanding bills grouped by aging buckets (Current, 1-30, 31-60, 61-90, 90+ days). Amounts are in integer cents.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const bills = await db.query.bill.findMany({
          where: and(
            eq(bill.organizationId, ctx.organizationId),
            isNull(bill.deletedAt),
            ne(bill.status, "void"),
            ne(bill.status, "paid"),
            ne(bill.status, "draft")
          ),
          with: { contact: true },
        });

        type BillBucketItem = { id: string; billNumber: string; contactName: string; dueDate: string; amountDue: number; daysOverdue: number };
        const today = new Date();
        const buckets: { label: string; total: number; count: number; bills: BillBucketItem[] }[] = [
          { label: "Current", total: 0, count: 0, bills: [] },
          { label: "1-30 days", total: 0, count: 0, bills: [] },
          { label: "31-60 days", total: 0, count: 0, bills: [] },
          { label: "61-90 days", total: 0, count: 0, bills: [] },
          { label: "90+ days", total: 0, count: 0, bills: [] },
        ];

        for (const b of bills) {
          const due = new Date(b.dueDate);
          const daysOverdue = Math.floor(
            (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
          );

          let bucketIdx: number;
          if (daysOverdue <= 0) bucketIdx = 0;
          else if (daysOverdue <= 30) bucketIdx = 1;
          else if (daysOverdue <= 60) bucketIdx = 2;
          else if (daysOverdue <= 90) bucketIdx = 3;
          else bucketIdx = 4;

          buckets[bucketIdx].bills.push({
            id: b.id,
            billNumber: b.billNumber,
            contactName: b.contact?.name ?? "Unknown",
            dueDate: b.dueDate,
            amountDue: b.amountDue,
            daysOverdue: Math.max(0, daysOverdue),
          });
          buckets[bucketIdx].total += b.amountDue;
          buckets[bucketIdx].count += 1;
        }

        const grandTotal = buckets.reduce((sum, bkt) => sum + bkt.total, 0);
        return { buckets, grandTotal };
      })
  );

  server.tool(
    "stripe_fee_report",
    "Generate a Stripe fee report grouped by month. Shows total fees, fee refunds, net fees, and transaction count per month. Amounts in integer cents.",
    {
      startDate: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD, default 90 days ago)"),
      endDate: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD, default today)"),
      integrationId: z
        .string()
        .optional()
        .describe("UUID of a specific Stripe integration to filter by"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const endDate = params.endDate ?? new Date().toISOString().slice(0, 10);
        const startDate = params.startDate ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const conditions = [
          eq(journalEntry.organizationId, ctx.organizationId),
          eq(journalEntry.status, "posted"),
          isNull(journalEntry.deletedAt),
          gte(journalEntry.date, startDate),
          lte(journalEntry.date, endDate),
          inArray(journalEntry.sourceType, ["stripe_fee", "stripe_fee_refund"]),
        ];

        if (params.integrationId) {
          // Filter by reference to get entries from this integration only
          // Entries are linked via stripeEntityMap, but we can use sourceType filter for simplicity
        }

        const entries = await db
          .select({
            month: sql<string>`to_char(${journalEntry.date}::date, 'YYYY-MM')`.as("month"),
            sourceType: journalEntry.sourceType,
            totalDebit: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`,
            totalCredit: sql<number>`coalesce(sum(${journalLine.creditAmount}), 0)`,
            count: sql<number>`count(distinct ${journalEntry.id})`.mapWith(Number),
          })
          .from(journalEntry)
          .innerJoin(journalLine, eq(journalLine.journalEntryId, journalEntry.id))
          .where(and(...conditions))
          .groupBy(sql`to_char(${journalEntry.date}::date, 'YYYY-MM')`, journalEntry.sourceType)
          .orderBy(sql`to_char(${journalEntry.date}::date, 'YYYY-MM')`);

        // Group by month
        const monthMap = new Map<string, { totalFees: number; totalRefunds: number; transactionCount: number }>();

        for (const row of entries) {
          const existing = monthMap.get(row.month) ?? { totalFees: 0, totalRefunds: 0, transactionCount: 0 };

          if (row.sourceType === "stripe_fee") {
            existing.totalFees += Number(row.totalDebit);
            existing.transactionCount += row.count;
          } else if (row.sourceType === "stripe_fee_refund") {
            existing.totalRefunds += Number(row.totalCredit);
            existing.transactionCount += row.count;
          }

          monthMap.set(row.month, existing);
        }

        const periods = Array.from(monthMap.entries()).map(([month, data]) => ({
          month,
          totalFees: data.totalFees,
          totalRefunds: data.totalRefunds,
          netFees: data.totalFees - data.totalRefunds,
          transactionCount: data.transactionCount,
        }));

        const totals = periods.reduce(
          (acc, p) => ({
            totalFees: acc.totalFees + p.totalFees,
            totalRefunds: acc.totalRefunds + p.totalRefunds,
            netFees: acc.netFees + p.netFees,
            transactionCount: acc.transactionCount + p.transactionCount,
          }),
          { totalFees: 0, totalRefunds: 0, netFees: 0, transactionCount: 0 }
        );

        return { startDate, endDate, periods, totals };
      })
  );

  server.tool(
    "cash_flow_statement",
    "Generate a cash flow statement using the indirect method. Shows operating, investing, and financing activities with opening/closing cash balances. Amounts in integer cents.",
    {
      startDate: z
        .string()
        .describe("Start date (YYYY-MM-DD)"),
      endDate: z
        .string()
        .describe("End date (YYYY-MM-DD)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const { startDate, endDate } = params;

        // Helper to get account balance delta in a period
        async function getBalanceDelta(
          accountTypes: string[],
          subTypes?: string[]
        ): Promise<{ accountId: string; code: string; name: string; delta: number }[]> {
          const conditions = [
            eq(journalEntry.organizationId, ctx.organizationId),
            eq(journalEntry.status, "posted"),
            isNull(journalEntry.deletedAt),
            gte(journalEntry.date, startDate),
            lte(journalEntry.date, endDate),
            sql`${chartAccount.type} IN (${sql.join(accountTypes.map(t => sql`${t}`), sql`, `)})`,
          ];

          if (subTypes && subTypes.length > 0) {
            conditions.push(
              sql`${chartAccount.subType} IN (${sql.join(subTypes.map(s => sql`${s}`), sql`, `)})`
            );
          }

          const rows = await db
            .select({
              accountId: chartAccount.id,
              code: chartAccount.code,
              name: chartAccount.name,
              type: chartAccount.type,
              debit: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`,
              credit: sql<number>`coalesce(sum(${journalLine.creditAmount}), 0)`,
            })
            .from(journalLine)
            .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
            .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
            .where(and(...conditions))
            .groupBy(chartAccount.id, chartAccount.code, chartAccount.name, chartAccount.type);

          return rows.map((r) => {
            const isDebitNormal = ["asset", "expense"].includes(r.type);
            const delta = isDebitNormal
              ? Number(r.debit) - Number(r.credit)
              : Number(r.credit) - Number(r.debit);
            return { accountId: r.accountId, code: r.code, name: r.name, delta };
          });
        }

        // Get net income (revenue - expenses)
        const revenueAccounts = await getBalanceDelta(["revenue"]);
        const expenseAccounts = await getBalanceDelta(["expense"]);
        const totalRevenue = revenueAccounts.reduce((s, a) => s + a.delta, 0);
        const totalExpenses = expenseAccounts.reduce((s, a) => s + a.delta, 0);
        const netIncome = totalRevenue - totalExpenses;

        // Depreciation add-back
        const [depResult] = await db
          .select({
            total: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`,
          })
          .from(journalLine)
          .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
          .where(
            and(
              eq(journalEntry.organizationId, ctx.organizationId),
              eq(journalEntry.status, "posted"),
              isNull(journalEntry.deletedAt),
              eq(journalEntry.sourceType, "depreciation"),
              gte(journalEntry.date, startDate),
              lte(journalEntry.date, endDate)
            )
          );
        const depreciation = Number(depResult?.total ?? 0);

        // Working capital changes (current assets and current liabilities)
        const arChanges = await getBalanceDelta(["asset"], ["accounts_receivable"]);
        const apChanges = await getBalanceDelta(["liability"], ["accounts_payable", "current_liability"]);
        const inventoryChanges = await getBalanceDelta(["asset"], ["inventory"]);

        const arDelta = arChanges.reduce((s, a) => s + a.delta, 0);
        const apDelta = apChanges.reduce((s, a) => s + a.delta, 0);
        const inventoryDelta = inventoryChanges.reduce((s, a) => s + a.delta, 0);

        const operatingActivities = {
          netIncome,
          depreciation,
          workingCapitalChanges: {
            accountsReceivable: -arDelta, // Increase in AR reduces cash
            accountsPayable: apDelta, // Increase in AP increases cash
            inventory: -inventoryDelta, // Increase in inventory reduces cash
          },
          total: netIncome + depreciation - arDelta + apDelta - inventoryDelta,
        };

        // Investing activities: fixed asset changes
        const fixedAssetChanges = await getBalanceDelta(["asset"], ["fixed_asset", "property_plant_equipment"]);
        const investingTotal = -fixedAssetChanges.reduce((s, a) => s + a.delta, 0);

        const investingActivities = {
          items: fixedAssetChanges.map((a) => ({
            name: a.name,
            amount: -a.delta, // Asset increase = cash outflow
          })),
          total: investingTotal,
        };

        // Financing activities: loan payments + equity changes
        const [loanResult] = await db
          .select({
            total: sql<number>`coalesce(sum(${journalLine.creditAmount}) - sum(${journalLine.debitAmount}), 0)`,
          })
          .from(journalLine)
          .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
          .where(
            and(
              eq(journalEntry.organizationId, ctx.organizationId),
              eq(journalEntry.status, "posted"),
              isNull(journalEntry.deletedAt),
              eq(journalEntry.sourceType, "loan_payment"),
              gte(journalEntry.date, startDate),
              lte(journalEntry.date, endDate)
            )
          );

        const equityChanges = await getBalanceDelta(["equity"]);
        const equityDelta = equityChanges.reduce((s, a) => s + a.delta, 0);
        const loanPayments = Number(loanResult?.total ?? 0);

        const financingActivities = {
          loanPayments,
          equityChanges: equityDelta,
          total: loanPayments + equityDelta,
        };

        // Cash balances
        const cashSubTypes = ["cash", "bank"];

        // Opening cash balance (all cash account entries before startDate)
        const [openingResult] = await db
          .select({
            debit: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`,
            credit: sql<number>`coalesce(sum(${journalLine.creditAmount}), 0)`,
          })
          .from(journalLine)
          .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
          .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
          .where(
            and(
              eq(journalEntry.organizationId, ctx.organizationId),
              eq(journalEntry.status, "posted"),
              isNull(journalEntry.deletedAt),
              sql`${journalEntry.date} < ${startDate}`,
              eq(chartAccount.type, "asset"),
              sql`${chartAccount.subType} IN (${sql.join(cashSubTypes.map(s => sql`${s}`), sql`, `)})`
            )
          );

        const openingCash = Number(openingResult?.debit ?? 0) - Number(openingResult?.credit ?? 0);
        const netCashChange = operatingActivities.total + investingActivities.total + financingActivities.total;
        const closingCash = openingCash + netCashChange;

        return {
          startDate,
          endDate,
          openingCashBalance: openingCash,
          operatingActivities,
          investingActivities,
          financingActivities,
          netCashChange,
          closingCashBalance: closingCash,
        };
      })
  );

  server.tool(
    "export_financial_statement",
    "Render a financial statement as a downloadable PDF or XLSX (Excel) file. Returns the file base64-encoded along with its filename and MIME type. Only posted journal data is included. Monetary figures are computed in integer cents and scaled by the file renderer. For date-ranged statements (profit_and_loss, general_ledger) provide 'from' and 'to'; balance_sheet, trial_balance, aged_receivables and aged_payables are point-in-time and ignore the dates.",
    {
      statement: z
        .enum([
          "balance_sheet",
          "profit_and_loss",
          "trial_balance",
          "general_ledger",
          "aged_receivables",
          "aged_payables",
        ])
        .describe("Which financial statement to export"),
      format: z
        .enum(["pdf", "xlsx"])
        .describe("Output file format: 'pdf' or 'xlsx' (Excel)"),
      from: z
        .string()
        .optional()
        .describe(
          "Start date YYYY-MM-DD for date-ranged statements (defaults to Jan 1 of current year)"
        ),
      to: z
        .string()
        .optional()
        .describe(
          "End date YYYY-MM-DD for date-ranged statements (defaults to today)"
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const startDate = params.from ?? `${new Date().getFullYear()}-01-01`;
        const endDate = params.to ?? new Date().toISOString().slice(0, 10);
        const asAt = new Date().toISOString().slice(0, 10);

        const org = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
          columns: { defaultCurrency: true },
        });
        const currency = org?.defaultCurrency || "USD";

        let statement: Statement;
        let baseName: string;

        if (params.statement === "balance_sheet") {
          const accounts = await db
            .select({
              code: chartAccount.code,
              name: chartAccount.name,
              type: chartAccount.type,
              debitTotal: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`,
              creditTotal: sql<number>`coalesce(sum(${journalLine.creditAmount}), 0)`,
            })
            .from(chartAccount)
            .leftJoin(journalLine, eq(journalLine.accountId, chartAccount.id))
            .leftJoin(
              journalEntry,
              and(
                eq(journalLine.journalEntryId, journalEntry.id),
                eq(journalEntry.status, "posted")
              )
            )
            .where(
              and(
                eq(chartAccount.organizationId, ctx.organizationId),
                sql`${chartAccount.type} in ('asset', 'liability', 'equity')`
              )
            )
            .groupBy(chartAccount.code, chartAccount.name, chartAccount.type)
            .orderBy(chartAccount.code);

          const buildSection = (type: string, label: string) => {
            const isDebitNormal = type === "asset";
            const filtered = accounts.filter((a) => a.type === type);
            let totalCents = 0;
            const rows = filtered.map((a) => {
              const debit = Number(a.debitTotal);
              const credit = Number(a.creditTotal);
              const balanceCents = isDebitNormal ? debit - credit : credit - debit;
              totalCents += balanceCents;
              return { code: a.code, name: a.name, amount: balanceCents, depth: 1 };
            });
            return { label, rows, subtotal: totalCents };
          };

          statement = {
            title: "Balance Sheet",
            periodLabel: `As at ${asAt}`,
            currency,
            sections: [
              buildSection("asset", "Assets"),
              buildSection("liability", "Liabilities"),
              buildSection("equity", "Equity"),
            ],
          };
          baseName = `balance-sheet-${asAt}`;
        } else if (params.statement === "trial_balance") {
          const accounts = await db
            .select({
              code: chartAccount.code,
              name: chartAccount.name,
              type: chartAccount.type,
              debitTotal: sql<number>`coalesce(sum(${journalLine.debitAmount}), 0)`,
              creditTotal: sql<number>`coalesce(sum(${journalLine.creditAmount}), 0)`,
            })
            .from(chartAccount)
            .leftJoin(journalLine, eq(journalLine.accountId, chartAccount.id))
            .leftJoin(
              journalEntry,
              and(
                eq(journalLine.journalEntryId, journalEntry.id),
                eq(journalEntry.status, "posted")
              )
            )
            .where(eq(chartAccount.organizationId, ctx.organizationId))
            .groupBy(chartAccount.code, chartAccount.name, chartAccount.type)
            .orderBy(chartAccount.code);

          let totalCents = 0;
          const rows = accounts.map((a) => {
            const debit = Number(a.debitTotal);
            const credit = Number(a.creditTotal);
            const isDebitNormal = ["asset", "expense"].includes(a.type);
            const balanceCents = isDebitNormal ? debit - credit : credit - debit;
            totalCents += balanceCents;
            return { code: a.code, name: a.name, amount: balanceCents, depth: 0 };
          });

          statement = {
            title: "Trial Balance",
            periodLabel: `As at ${asAt}`,
            currency,
            sections: [{ label: "Accounts", rows, subtotal: totalCents }],
          };
          baseName = `trial-balance-${asAt}`;
        } else if (params.statement === "profit_and_loss") {
          const entries = await db
            .select({
              accountName: chartAccount.name,
              accountCode: chartAccount.code,
              accountType: chartAccount.type,
              debit: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`.as("debit"),
              credit: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`.as("credit"),
            })
            .from(journalLine)
            .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
            .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
            .where(
              and(
                eq(journalEntry.organizationId, ctx.organizationId),
                eq(journalEntry.status, "posted"),
                isNull(journalEntry.deletedAt),
                gte(journalEntry.date, startDate),
                lte(journalEntry.date, endDate)
              )
            )
            .groupBy(chartAccount.name, chartAccount.code, chartAccount.type);

          const revenueRows: { code: string; name: string; amount: number; depth: number }[] = [];
          const expenseRows: typeof revenueRows = [];
          let totalRevenue = 0;
          let totalExpenses = 0;

          for (const row of entries) {
            const debit = Number(row.debit);
            const credit = Number(row.credit);
            if (row.accountType === "revenue") {
              const amount = credit - debit;
              totalRevenue += amount;
              revenueRows.push({ code: row.accountCode, name: row.accountName, amount, depth: 1 });
            } else if (row.accountType === "expense") {
              const amount = debit - credit;
              totalExpenses += amount;
              expenseRows.push({ code: row.accountCode, name: row.accountName, amount, depth: 1 });
            }
          }

          statement = {
            title: "Profit and Loss",
            periodLabel: `${startDate} to ${endDate}`,
            currency,
            sections: [
              { label: "Revenue", rows: revenueRows, subtotal: totalRevenue },
              { label: "Expenses", rows: expenseRows, subtotal: totalExpenses },
            ],
            grandTotal: totalRevenue - totalExpenses,
          };
          baseName = `profit-and-loss-${startDate}-${endDate}`;
        } else if (params.statement === "general_ledger") {
          const rows = await db
            .select({
              accountCode: chartAccount.code,
              accountName: chartAccount.name,
              accountType: chartAccount.type,
              date: journalEntry.date,
              entryNumber: journalEntry.entryNumber,
              description: journalEntry.description,
              debit: journalLine.debitAmount,
              credit: journalLine.creditAmount,
            })
            .from(journalLine)
            .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
            .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
            .where(
              and(
                eq(journalEntry.organizationId, ctx.organizationId),
                eq(journalEntry.status, "posted"),
                isNull(journalEntry.deletedAt),
                gte(journalEntry.date, startDate),
                lte(journalEntry.date, endDate)
              )
            )
            .orderBy(asc(chartAccount.code), asc(journalEntry.date), asc(journalEntry.entryNumber));

          type GlSection = {
            label: string;
            rows: { name: string; amount: number; depth: number }[];
            subtotal: number;
          };
          const sectionMap = new Map<string, GlSection>();
          for (const r of rows) {
            const key = `${r.accountCode} ${r.accountName}`;
            let sec = sectionMap.get(key);
            if (!sec) {
              sec = { label: key, rows: [], subtotal: 0 };
              sectionMap.set(key, sec);
            }
            const isDebitNormal = r.accountType === "asset" || r.accountType === "expense";
            const delta = isDebitNormal ? r.debit - r.credit : r.credit - r.debit;
            sec.subtotal += delta;
            sec.rows.push({
              name: `${r.date} ${r.entryNumber}${r.description ? ` - ${r.description}` : ""}`,
              amount: r.debit - r.credit,
              depth: 1,
            });
          }

          statement = {
            title: "General Ledger",
            periodLabel: `${startDate} to ${endDate}`,
            currency,
            sections: Array.from(sectionMap.values()),
          };
          baseName = `general-ledger-${startDate}-${endDate}`;
        } else {
          // aged_receivables | aged_payables
          const isReceivables = params.statement === "aged_receivables";
          const today = new Date();
          const bucketDefs = ["Current", "1-30 days", "31-60 days", "61-90 days", "90+ days"];
          const sections: Statement["sections"] = bucketDefs.map((label) => ({
            label,
            rows: [],
            subtotal: 0,
          }));

          const pickBucket = (daysOverdue: number) => {
            if (daysOverdue <= 0) return 0;
            if (daysOverdue <= 30) return 1;
            if (daysOverdue <= 60) return 2;
            if (daysOverdue <= 90) return 3;
            return 4;
          };

          let grandTotal = 0;
          if (isReceivables) {
            const invoices = await db.query.invoice.findMany({
              where: and(
                eq(invoice.organizationId, ctx.organizationId),
                isNull(invoice.deletedAt),
                ne(invoice.status, "void"),
                ne(invoice.status, "paid"),
                ne(invoice.status, "draft")
              ),
              with: { contact: true },
            });
            for (const inv of invoices) {
              const due = new Date(inv.dueDate);
              const daysOverdue = Math.floor(
                (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
              );
              const idx = pickBucket(daysOverdue);
              sections[idx].rows.push({
                code: inv.invoiceNumber,
                name: inv.contact?.name ?? "Unknown",
                amount: inv.amountDue,
                depth: 1,
              });
              sections[idx].subtotal = (sections[idx].subtotal ?? 0) + inv.amountDue;
              grandTotal += inv.amountDue;
            }
          } else {
            const bills = await db.query.bill.findMany({
              where: and(
                eq(bill.organizationId, ctx.organizationId),
                isNull(bill.deletedAt),
                ne(bill.status, "void"),
                ne(bill.status, "paid"),
                ne(bill.status, "draft")
              ),
              with: { contact: true },
            });
            for (const b of bills) {
              const due = new Date(b.dueDate);
              const daysOverdue = Math.floor(
                (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
              );
              const idx = pickBucket(daysOverdue);
              sections[idx].rows.push({
                code: b.billNumber,
                name: b.contact?.name ?? "Unknown",
                amount: b.amountDue,
                depth: 1,
              });
              sections[idx].subtotal = (sections[idx].subtotal ?? 0) + b.amountDue;
              grandTotal += b.amountDue;
            }
          }

          statement = {
            title: isReceivables ? "Aged Receivables" : "Aged Payables",
            periodLabel: `As at ${asAt}`,
            currency,
            sections,
            grandTotal,
          };
          baseName = `${isReceivables ? "aged-receivables" : "aged-payables"}-${asAt}`;
        }

        const { toPdf, toXlsx } = await import("@/lib/reports/statement-export");
        let buffer: Buffer;
        let mimeType: string;
        let filename: string;
        if (params.format === "pdf") {
          buffer = await toPdf(statement);
          mimeType = "application/pdf";
          filename = `${baseName}.pdf`;
        } else {
          buffer = await toXlsx(statement);
          mimeType =
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          filename = `${baseName}.xlsx`;
        }

        return {
          statement: params.statement,
          format: params.format,
          filename,
          mimeType,
          encoding: "base64",
          data: buffer.toString("base64"),
        };
      })
  );

  server.tool(
    "tracking_category_report",
    "Compare activity across a tracking dimension (cost center or project) over a date range, laying out one amount column per dimension value. mode='pnl' (default) returns revenue & expense sections plus per-column net income; mode='balances' returns every account type. Amounts are integer cents (natural-signed). Each row includes accountId for drill-down into general-ledger with the same costCenterId/projectId filter. The `columns` array describes each amount column; its `dimensionValue` is the id to pass to other reports (null = unassigned).",
    {
      dimension: z
        .enum(["costCenterId", "projectId"])
        .optional()
        .describe(
          "Tracking dimension to compare across columns. Defaults to 'costCenterId'."
        ),
      mode: z
        .enum(["pnl", "balances"])
        .optional()
        .describe(
          "'pnl' (default): revenue/expense sections + net income per column. 'balances': all account types with natural-sign balances per column."
        ),
      basis: z
        .enum(["accrual", "cash"])
        .optional()
        .describe(
          "Reporting basis: 'accrual' (default) or 'cash' (cash/payment-realized movement only)."
        ),
      startDate: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD, defaults to Jan 1 of current year)"),
      endDate: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD, defaults to today)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const startDate =
          params.startDate ?? `${new Date().getFullYear()}-01-01`;
        const endDate = params.endDate ?? new Date().toISOString().slice(0, 10);
        const dimension: Dimension = params.dimension ?? "costCenterId";
        const mode = params.mode === "balances" ? "balances" : "pnl";
        const basis = parseBasis(params.basis);

        const accountTypes: AccountAggregate["type"][] =
          mode === "pnl"
            ? ["revenue", "expense"]
            : ["asset", "liability", "equity", "revenue", "expense"];

        const groups: DimensionGroup[] = await aggregateByDimension(
          ctx.organizationId,
          { startDate, endDate },
          dimension,
          { basis, accountTypes }
        );

        // Resolve dimension-value ids -> human labels (cost center "CODE Name",
        // project "Name"). Only values present in the data are looked up.
        const UNASSIGNED_KEY = "__none__";
        const ids = groups
          .map((g) => g.dimensionValue)
          .filter((v): v is string => v !== null);
        const labels = new Map<string, string>();
        if (ids.length > 0) {
          const unique = new Set(ids);
          if (dimension === "costCenterId") {
            const rows = await db
              .select({
                id: costCenter.id,
                code: costCenter.code,
                name: costCenter.name,
              })
              .from(costCenter)
              .where(eq(costCenter.organizationId, ctx.organizationId));
            for (const r of rows) {
              if (unique.has(r.id)) {
                labels.set(r.id, r.code ? `${r.code} ${r.name}` : r.name);
              }
            }
          } else {
            const rows = await db
              .select({ id: project.id, name: project.name })
              .from(project)
              .where(eq(project.organizationId, ctx.organizationId));
            for (const r of rows) {
              if (unique.has(r.id)) labels.set(r.id, r.name);
            }
          }
        }

        const realKeys = groups
          .filter((g) => g.dimensionValue !== null)
          .map((g) => g.dimensionValue as string)
          .sort((a, b) =>
            (labels.get(a) || a).localeCompare(labels.get(b) || b)
          );
        const hasUnassigned = groups.some((g) => g.dimensionValue === null);
        const columnKeys = [
          ...realKeys,
          ...(hasUnassigned ? [UNASSIGNED_KEY] : []),
        ];
        const columnLabels = columnKeys.map((key) =>
          key === UNASSIGNED_KEY ? "Unassigned" : labels.get(key) || key
        );

        const byColumn = new Map<string, Map<string, AccountAggregate>>();
        for (const g of groups) {
          const key =
            g.dimensionValue === null ? UNASSIGNED_KEY : g.dimensionValue;
          const acctMap =
            byColumn.get(key) || new Map<string, AccountAggregate>();
          for (const a of g.accounts) acctMap.set(a.accountId, a);
          byColumn.set(key, acctMap);
        }

        const accountMeta = new Map<
          string,
          {
            accountId: string;
            code: string;
            name: string;
            type: AccountAggregate["type"];
          }
        >();
        for (const g of groups) {
          for (const a of g.accounts) {
            if (!accountMeta.has(a.accountId)) {
              accountMeta.set(a.accountId, {
                accountId: a.accountId,
                code: a.code,
                name: a.name,
                type: a.type,
              });
            }
          }
        }
        const orderedAccounts = Array.from(accountMeta.values()).sort((a, b) =>
          a.code.localeCompare(b.code)
        );

        const balanceFor = (accountId: string, columnKey: string): number =>
          byColumn.get(columnKey)?.get(accountId)?.balance ?? 0;

        interface AccountRow {
          accountId: string;
          accountCode: string;
          accountName: string;
          accountType: AccountAggregate["type"];
          amounts: number[];
          total: number;
        }
        const buildRows = (types: AccountAggregate["type"][]): AccountRow[] =>
          orderedAccounts
            .filter((a) => types.includes(a.type))
            .map((a) => {
              const amounts = columnKeys.map((k) =>
                balanceFor(a.accountId, k)
              );
              return {
                accountId: a.accountId,
                accountCode: a.code,
                accountName: a.name,
                accountType: a.type,
                amounts,
                total: amounts.reduce((s, n) => s + n, 0),
              };
            });
        const sumColumns = (rows: AccountRow[]): number[] =>
          columnKeys.map((_, i) => rows.reduce((s, r) => s + r.amounts[i], 0));

        let sections: Array<{
          label: string;
          accounts: AccountRow[];
          totals: number[];
          total: number;
        }>;
        let netIncome: { byColumn: number[]; total: number } | undefined;

        if (mode === "pnl") {
          const revenueRows = buildRows(["revenue"]);
          const expenseRows = buildRows(["expense"]);
          const revenueTotals = sumColumns(revenueRows);
          const expenseTotals = sumColumns(expenseRows);
          const netByColumn = columnKeys.map(
            (_, i) => revenueTotals[i] - expenseTotals[i]
          );
          netIncome = {
            byColumn: netByColumn,
            total: netByColumn.reduce((s, n) => s + n, 0),
          };
          sections = [
            {
              label: "Revenue",
              accounts: revenueRows,
              totals: revenueTotals,
              total: revenueTotals.reduce((s, n) => s + n, 0),
            },
            {
              label: "Expenses",
              accounts: expenseRows,
              totals: expenseTotals,
              total: expenseTotals.reduce((s, n) => s + n, 0),
            },
          ];
        } else {
          const sectionDefs: Array<{
            label: string;
            types: AccountAggregate["type"][];
          }> = [
            { label: "Assets", types: ["asset"] },
            { label: "Liabilities", types: ["liability"] },
            { label: "Equity", types: ["equity"] },
            { label: "Revenue", types: ["revenue"] },
            { label: "Expenses", types: ["expense"] },
          ];
          sections = sectionDefs.map((def) => {
            const rows = buildRows(def.types);
            const totals = sumColumns(rows);
            return {
              label: def.label,
              accounts: rows,
              totals,
              total: totals.reduce((s, n) => s + n, 0),
            };
          });
        }

        return {
          dimension,
          mode,
          basis,
          startDate,
          endDate,
          columns: columnKeys.map((key, i) => ({
            key,
            label: columnLabels[i],
            dimensionValue: key === UNASSIGNED_KEY ? null : key,
          })),
          sections,
          ...(netIncome ? { netIncome } : {}),
        };
      })
  );

  server.tool(
    "report_pack",
    "Generate a bundled financial report pack for a period: Balance Sheet (cumulative as at endDate), Profit & Loss (period activity), Trial Balance (cumulative as at endDate), and a Cash Flow Summary (opening/closing cash + net change). Returns each statement's structured sections (rows carry amounts in integer cents) so a client can render or export them. Use accrual (default) or cash basis.",
    {
      startDate: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD, defaults to Jan 1 of current year)"),
      endDate: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD, defaults to today)"),
      basis: z
        .enum(["accrual", "cash"])
        .optional()
        .describe(
          "Reporting basis: 'accrual' (default) or 'cash' (cash/payment-realized movement only)."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const startDate =
          params.startDate ?? `${new Date().getFullYear()}-01-01`;
        const endDate = params.endDate ?? new Date().toISOString().slice(0, 10);
        const basis = parseBasis(params.basis);

        // Opening cash = day before the period start.
        const openingAsAt = new Date(startDate);
        openingAsAt.setDate(openingAsAt.getDate() - 1);
        const openingAsAtStr = openingAsAt.toISOString().slice(0, 10);

        const [pl, balancesAsAt, openingBalances] = await Promise.all([
          aggregateByDateRange(
            ctx.organizationId,
            { startDate, endDate },
            { basis, accountTypes: ["revenue", "expense"] }
          ),
          aggregateAsAt(ctx.organizationId, endDate, {
            basis,
            accountTypes: ["asset", "liability", "equity"],
            includeEmptyAccounts: true,
          }),
          aggregateAsAt(ctx.organizationId, openingAsAtStr, {
            basis,
            accountTypes: ["asset"],
          }),
        ]);

        const org = await db.query.organization.findFirst({
          where: eq(organization.id, ctx.organizationId),
          columns: { defaultCurrency: true },
        });
        const currency = org?.defaultCurrency || "USD";

        const CASH_SUBTYPES = ["bank"];
        const sumCash = (aggs: AccountAggregate[]) =>
          aggs
            .filter((a) => a.subType !== null && CASH_SUBTYPES.includes(a.subType))
            .reduce((s, a) => s + a.balance, 0);
        const rowsForType = (
          aggs: AccountAggregate[],
          type: AccountAggregate["type"]
        ) =>
          aggs
            .filter((a) => a.type === type)
            .map((a) => ({
              code: a.code,
              name: a.name,
              amount: a.balance,
              depth: 1,
            }));

        const totalRevenue = pl
          .filter((a) => a.type === "revenue")
          .reduce((s, a) => s + a.balance, 0);
        const totalExpenses = pl
          .filter((a) => a.type === "expense")
          .reduce((s, a) => s + a.balance, 0);
        const netIncome = totalRevenue - totalExpenses;
        const closingCash = sumCash(balancesAsAt);
        const openingCash = sumCash(openingBalances);

        // Balance Sheet (current earnings carried into equity so it balances).
        const assetRows = rowsForType(balancesAsAt, "asset");
        const liabilityRows = rowsForType(balancesAsAt, "liability");
        const equityRows = rowsForType(balancesAsAt, "equity");
        const totalAssets = assetRows.reduce((s, r) => s + r.amount, 0);
        const totalLiabilities = liabilityRows.reduce((s, r) => s + r.amount, 0);
        const totalEquityAccounts = equityRows.reduce((s, r) => s + r.amount, 0);
        const equityWithEarnings = [
          ...equityRows,
          { code: "", name: "Current Earnings", amount: netIncome, depth: 1 },
        ];
        const totalEquity = totalEquityAccounts + netIncome;

        const balanceSheet: Statement = {
          title: "Balance Sheet",
          periodLabel: `As at ${endDate}`,
          currency,
          sections: [
            { label: "Assets", rows: assetRows, subtotal: totalAssets },
            {
              label: "Liabilities",
              rows: liabilityRows,
              subtotal: totalLiabilities,
            },
            { label: "Equity", rows: equityWithEarnings, subtotal: totalEquity },
          ],
          grandTotal: totalLiabilities + totalEquity,
        };

        const profitAndLoss: Statement = {
          title: "Profit and Loss",
          periodLabel: `${startDate} to ${endDate}`,
          currency,
          sections: [
            {
              label: "Revenue",
              rows: rowsForType(pl, "revenue"),
              subtotal: totalRevenue,
            },
            {
              label: "Expenses",
              rows: rowsForType(pl, "expense"),
              subtotal: totalExpenses,
            },
          ],
          grandTotal: netIncome,
        };

        // Trial Balance: re-derive debit/credit columns from natural-sign balance.
        const tbRows = balancesAsAt
          .filter((a) => a.balance !== 0)
          .map((a) => {
            const debitNormal = a.type === "asset" || a.type === "expense";
            const debit = debitNormal
              ? Math.max(a.balance, 0)
              : Math.max(-a.balance, 0);
            const credit = debitNormal
              ? Math.max(-a.balance, 0)
              : Math.max(a.balance, 0);
            return { code: a.code, name: a.name, debit, credit };
          });
        const tbTotalDebit = tbRows.reduce((s, r) => s + r.debit, 0);
        const tbTotalCredit = tbRows.reduce((s, r) => s + r.credit, 0);
        const trialBalance: Statement = {
          title: "Trial Balance",
          periodLabel: `As at ${endDate}`,
          currency,
          columns: ["Debit", "Credit"],
          sections: [
            {
              label: "Accounts",
              rows: tbRows.map((r) => ({
                code: r.code,
                name: r.name,
                amounts: [r.debit, r.credit],
                depth: 1,
              })),
              subtotals: [tbTotalDebit, tbTotalCredit],
            },
          ],
          grandTotals: [tbTotalDebit, tbTotalCredit],
        };

        const netChange = closingCash - openingCash;
        const cashFlow: Statement = {
          title: "Cash Flow Summary",
          periodLabel: `${startDate} to ${endDate}`,
          currency,
          sections: [
            {
              label: "Cash Movement",
              rows: [
                { name: "Opening cash", amount: openingCash, depth: 1 },
                { name: "Net change in cash", amount: netChange, depth: 1 },
                {
                  name: "Closing cash",
                  amount: closingCash,
                  depth: 1,
                  bold: true,
                },
              ],
            },
            {
              label: "Reconciliation",
              rows: [
                { name: "Net income (period)", amount: netIncome, depth: 1 },
                {
                  name: "Net non-cash & working-capital movement",
                  amount: netChange - netIncome,
                  depth: 1,
                },
              ],
              subtotal: netChange,
            },
          ],
          grandTotal: closingCash,
        };

        return {
          startDate,
          endDate,
          basis,
          currency,
          statements: [balanceSheet, profitAndLoss, trialBalance, cashFlow],
        };
      })
  );

  server.tool(
    "executive_summary",
    "Generate a one-page KPI roll-up for a period, comparing it against the immediately preceding period of equal length. KPIs (all integer cents): Revenue, Gross Profit, Operating Expenses, Net Income, Cash on Hand, Accounts Receivable, Accounts Payable. Each KPI returns current, prior, delta (current−prior), and deltaPercent (null when prior is 0). Use accrual (default) or cash basis.",
    {
      startDate: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD, defaults to Jan 1 of current year)"),
      endDate: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD, defaults to today)"),
      basis: z
        .enum(["accrual", "cash"])
        .optional()
        .describe(
          "Reporting basis: 'accrual' (default) or 'cash' (cash/payment-realized movement only)."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const startDate =
          params.startDate ?? `${new Date().getFullYear()}-01-01`;
        const endDate = params.endDate ?? new Date().toISOString().slice(0, 10);
        const basis = parseBasis(params.basis);

        const daysBetween = (start: string, end: string): number => {
          const ms = new Date(end).getTime() - new Date(start).getTime();
          return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
        };
        const addDays = (iso: string, days: number): string => {
          const d = new Date(iso);
          d.setDate(d.getDate() + days);
          return d.toISOString().slice(0, 10);
        };

        const periodLen = daysBetween(startDate, endDate);
        const priorEnd = addDays(startDate, -1);
        const priorStart = addDays(priorEnd, -(periodLen - 1));

        const [currentPL, priorPL, currentBS, priorBS] = await Promise.all([
          aggregateByDateRange(
            ctx.organizationId,
            { startDate, endDate },
            { basis, accountTypes: ["revenue", "expense"] }
          ),
          aggregateByDateRange(
            ctx.organizationId,
            { startDate: priorStart, endDate: priorEnd },
            { basis, accountTypes: ["revenue", "expense"] }
          ),
          aggregateAsAt(ctx.organizationId, endDate, {
            basis,
            accountTypes: ["asset"],
          }),
          aggregateAsAt(ctx.organizationId, priorEnd, {
            basis,
            accountTypes: ["asset"],
          }),
        ]);

        const sumByType = (
          aggs: AccountAggregate[],
          type: AccountAggregate["type"]
        ) =>
          aggs.filter((a) => a.type === type).reduce((s, a) => s + a.balance, 0);
        const sumCogs = (aggs: AccountAggregate[]) =>
          aggs
            .filter((a) => a.type === "expense" && a.subType === "cogs")
            .reduce((s, a) => s + a.balance, 0);
        const sumCash = (aggs: AccountAggregate[]) =>
          aggs
            .filter((a) => a.subType === "bank")
            .reduce((s, a) => s + a.balance, 0);

        const revenueCurrent = sumByType(currentPL, "revenue");
        const revenuePrior = sumByType(priorPL, "revenue");
        const expensesCurrent = sumByType(currentPL, "expense");
        const expensesPrior = sumByType(priorPL, "expense");
        const cogsCurrent = sumCogs(currentPL);
        const cogsPrior = sumCogs(priorPL);

        const netIncomeCurrent = revenueCurrent - expensesCurrent;
        const netIncomePrior = revenuePrior - expensesPrior;
        const grossProfitCurrent = revenueCurrent - cogsCurrent;
        const grossProfitPrior = revenuePrior - cogsPrior;
        const cashCurrent = sumCash(currentBS);
        const cashPrior = sumCash(priorBS);

        // Outstanding receivables / payables (open documents at each period end).
        const [openInvoices, openBills] = await Promise.all([
          db.query.invoice.findMany({
            where: and(
              eq(invoice.organizationId, ctx.organizationId),
              isNull(invoice.deletedAt),
              ne(invoice.status, "void"),
              ne(invoice.status, "draft")
            ),
            columns: { issueDate: true, amountDue: true },
          }),
          db.query.bill.findMany({
            where: and(
              eq(bill.organizationId, ctx.organizationId),
              isNull(bill.deletedAt),
              ne(bill.status, "void"),
              ne(bill.status, "draft")
            ),
            columns: { issueDate: true, amountDue: true },
          }),
        ]);
        const arAsOf = (asAt: string) =>
          openInvoices
            .filter((i) => i.issueDate <= asAt)
            .reduce((s, i) => s + i.amountDue, 0);
        const apAsOf = (asAt: string) =>
          openBills
            .filter((b) => b.issueDate <= asAt)
            .reduce((s, b) => s + b.amountDue, 0);

        const makeKpi = (
          key: string,
          label: string,
          current: number,
          prior: number
        ) => {
          const delta = current - prior;
          const deltaPercent =
            prior === 0
              ? null
              : Math.round((delta / Math.abs(prior)) * 10000) / 100;
          return { key, label, current, prior, delta, deltaPercent };
        };

        const kpis = [
          makeKpi("revenue", "Revenue", revenueCurrent, revenuePrior),
          makeKpi(
            "grossProfit",
            "Gross Profit",
            grossProfitCurrent,
            grossProfitPrior
          ),
          makeKpi(
            "expenses",
            "Operating Expenses",
            expensesCurrent,
            expensesPrior
          ),
          makeKpi("netIncome", "Net Income", netIncomeCurrent, netIncomePrior),
          makeKpi("cash", "Cash on Hand", cashCurrent, cashPrior),
          makeKpi(
            "accountsReceivable",
            "Accounts Receivable",
            arAsOf(endDate),
            arAsOf(priorEnd)
          ),
          makeKpi(
            "accountsPayable",
            "Accounts Payable",
            apAsOf(endDate),
            apAsOf(priorEnd)
          ),
        ];

        return {
          period: { startDate, endDate },
          priorPeriod: { startDate: priorStart, endDate: priorEnd },
          basis,
          kpis,
        };
      })
  );

  server.tool(
    "sales_by_customer",
    "Aggregate issued invoice lines by customer over a date range, returning net (pre-tax line amount), tax, gross, and invoice count per customer. Excludes draft and void invoices. Amounts are integer cents. Sorted by net descending; includes a grand totals object.",
    {
      startDate: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD, defaults to Jan 1 of current year)"),
      endDate: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD, defaults to today)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const startDate =
          params.startDate ?? `${new Date().getFullYear()}-01-01`;
        const endDate = params.endDate ?? new Date().toISOString().slice(0, 10);

        const rows = await db
          .select({
            contactId: invoice.contactId,
            contactName: contact.name,
            net: sql<number>`coalesce(sum(${invoiceLine.amount}), 0)`,
            tax: sql<number>`coalesce(sum(${invoiceLine.taxAmount}), 0)`,
            invoiceCount: sql<number>`count(distinct ${invoice.id})`,
          })
          .from(invoiceLine)
          .innerJoin(invoice, eq(invoiceLine.invoiceId, invoice.id))
          .leftJoin(contact, eq(invoice.contactId, contact.id))
          .where(
            and(
              eq(invoice.organizationId, ctx.organizationId),
              isNull(invoice.deletedAt),
              ne(invoice.status, "void"),
              ne(invoice.status, "draft"),
              gte(invoice.issueDate, startDate),
              lte(invoice.issueDate, endDate)
            )
          )
          .groupBy(invoice.contactId, contact.name)
          .orderBy(sql`coalesce(sum(${invoiceLine.amount}), 0) desc`);

        const customers = rows.map((r) => {
          const net = Number(r.net);
          const tax = Number(r.tax);
          return {
            contactId: r.contactId,
            contactName: r.contactName || "Unknown",
            net,
            tax,
            gross: net + tax,
            invoiceCount: Number(r.invoiceCount),
          };
        });

        const totals = customers.reduce(
          (acc, c) => {
            acc.net += c.net;
            acc.tax += c.tax;
            acc.gross += c.gross;
            acc.invoiceCount += c.invoiceCount;
            return acc;
          },
          { net: 0, tax: 0, gross: 0, invoiceCount: 0 }
        );

        return { startDate, endDate, customers, totals };
      })
  );

  server.tool(
    "sales_by_item",
    "Aggregate issued invoice lines by inventory item over a date range, returning quantity sold, net (pre-tax line amount), tax, gross, and line count per item. Lines not linked to an item are grouped as 'Uncategorized' (itemId null). Excludes draft and void invoices. Monetary amounts are integer cents; quantity is the schema's 2-decimal integer (1.00 = 100) summed. Sorted by net descending; includes a grand totals object.",
    {
      startDate: z
        .string()
        .optional()
        .describe("Start date (YYYY-MM-DD, defaults to Jan 1 of current year)"),
      endDate: z
        .string()
        .optional()
        .describe("End date (YYYY-MM-DD, defaults to today)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const startDate =
          params.startDate ?? `${new Date().getFullYear()}-01-01`;
        const endDate = params.endDate ?? new Date().toISOString().slice(0, 10);

        const rows = await db
          .select({
            itemId: invoiceLine.inventoryItemId,
            itemCode: inventoryItem.code,
            itemName: inventoryItem.name,
            quantity: sql<number>`coalesce(sum(${invoiceLine.quantity}), 0)`,
            net: sql<number>`coalesce(sum(${invoiceLine.amount}), 0)`,
            tax: sql<number>`coalesce(sum(${invoiceLine.taxAmount}), 0)`,
            lineCount: sql<number>`count(${invoiceLine.id})`,
          })
          .from(invoiceLine)
          .innerJoin(invoice, eq(invoiceLine.invoiceId, invoice.id))
          .leftJoin(
            inventoryItem,
            eq(invoiceLine.inventoryItemId, inventoryItem.id)
          )
          .where(
            and(
              eq(invoice.organizationId, ctx.organizationId),
              isNull(invoice.deletedAt),
              ne(invoice.status, "void"),
              ne(invoice.status, "draft"),
              gte(invoice.issueDate, startDate),
              lte(invoice.issueDate, endDate)
            )
          )
          .groupBy(
            invoiceLine.inventoryItemId,
            inventoryItem.code,
            inventoryItem.name
          )
          .orderBy(sql`coalesce(sum(${invoiceLine.amount}), 0) desc`);

        const items = rows.map((r) => {
          const net = Number(r.net);
          const tax = Number(r.tax);
          return {
            itemId: r.itemId,
            itemCode: r.itemCode || null,
            itemName: r.itemId ? r.itemName || "Unknown item" : "Uncategorized",
            quantity: Number(r.quantity),
            net,
            tax,
            gross: net + tax,
            lineCount: Number(r.lineCount),
          };
        });

        const totals = items.reduce(
          (acc, i) => {
            acc.quantity += i.quantity;
            acc.net += i.net;
            acc.tax += i.tax;
            acc.gross += i.gross;
            acc.lineCount += i.lineCount;
            return acc;
          },
          { quantity: 0, net: 0, tax: 0, gross: 0, lineCount: 0 }
        );

        return { startDate, endDate, items, totals };
      })
  );
}

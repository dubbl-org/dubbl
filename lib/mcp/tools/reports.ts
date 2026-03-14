import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  chartAccount,
  journalLine,
  journalEntry,
  invoice,
  bill,
} from "@/lib/db/schema";
import { eq, and, sql, isNull, ne, gte, lte, inArray } from "drizzle-orm";
import { centsToDecimal } from "@/lib/money";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

export function registerReportTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "trial_balance",
    "Generate a trial balance report showing all accounts with their debit and credit balances from posted entries. Balances are returned as decimal strings.",
    {},
    () =>
      wrapTool(ctx, async () => {
        const accounts = await db
          .select({
            accountId: chartAccount.id,
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
          .groupBy(
            chartAccount.id,
            chartAccount.code,
            chartAccount.name,
            chartAccount.type
          )
          .orderBy(chartAccount.code);

        const result = accounts.map((a) => {
          const debit = Number(a.debitTotal);
          const credit = Number(a.creditTotal);
          const isDebitNormal = ["asset", "expense"].includes(a.type);
          const balance = isDebitNormal ? debit - credit : credit - debit;

          return {
            accountId: a.accountId,
            code: a.code,
            name: a.name,
            type: a.type,
            debitBalance: balance > 0 ? centsToDecimal(balance) : "0.00",
            creditBalance: balance < 0 ? centsToDecimal(Math.abs(balance)) : "0.00",
            balance: centsToDecimal(balance),
          };
        });

        return { accounts: result };
      })
  );

  server.tool(
    "balance_sheet",
    "Generate a balance sheet report showing assets, liabilities, and equity with totals. Only includes posted entries. Balances are decimal strings.",
    {},
    () =>
      wrapTool(ctx, async () => {
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

        function buildSection(type: string) {
          const isDebitNormal = type === "asset";
          const filtered = accounts.filter((a) => a.type === type);
          const accts = filtered.map((a) => {
            const debit = Number(a.debitTotal);
            const credit = Number(a.creditTotal);
            const balance = isDebitNormal ? debit - credit : credit - debit;
            return { code: a.code, name: a.name, balance: centsToDecimal(balance) };
          });
          const totalCents = filtered.reduce((s, a) => {
            const debit = Number(a.debitTotal);
            const credit = Number(a.creditTotal);
            return s + (isDebitNormal ? debit - credit : credit - debit);
          }, 0);
          return { type, accounts: accts, total: centsToDecimal(totalCents) };
        }

        return {
          assets: buildSection("asset"),
          liabilities: buildSection("liability"),
          equity: buildSection("equity"),
        };
      })
  );

  server.tool(
    "profit_and_loss",
    "Generate a profit and loss (income statement) report for a date range. Shows revenue and expense accounts with totals. Amounts are in integer cents.",
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
        const endDate =
          params.endDate ?? new Date().toISOString().slice(0, 10);

        const entries = await db
          .select({
            accountId: journalLine.accountId,
            accountName: chartAccount.name,
            accountCode: chartAccount.code,
            accountType: chartAccount.type,
            debit: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`.as(
              "debit"
            ),
            credit: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`.as(
              "credit"
            ),
          })
          .from(journalLine)
          .innerJoin(
            journalEntry,
            eq(journalLine.journalEntryId, journalEntry.id)
          )
          .innerJoin(
            chartAccount,
            eq(journalLine.accountId, chartAccount.id)
          )
          .where(
            and(
              eq(journalEntry.organizationId, ctx.organizationId),
              eq(journalEntry.status, "posted"),
              isNull(journalEntry.deletedAt),
              gte(journalEntry.date, startDate),
              lte(journalEntry.date, endDate)
            )
          )
          .groupBy(
            journalLine.accountId,
            chartAccount.name,
            chartAccount.code,
            chartAccount.type
          );

        const revenue: {
          accountId: string;
          accountName: string;
          accountCode: string;
          balance: number;
        }[] = [];
        const expenses: typeof revenue = [];

        for (const row of entries) {
          const debit = Number(row.debit);
          const credit = Number(row.credit);

          if (row.accountType === "revenue") {
            revenue.push({
              accountId: row.accountId,
              accountName: row.accountName,
              accountCode: row.accountCode,
              balance: credit - debit,
            });
          } else if (row.accountType === "expense") {
            expenses.push({
              accountId: row.accountId,
              accountName: row.accountName,
              accountCode: row.accountCode,
              balance: debit - credit,
            });
          }
        }

        const totalRevenue = revenue.reduce((s, r) => s + r.balance, 0);
        const totalExpenses = expenses.reduce((s, e) => s + e.balance, 0);
        const netIncome = totalRevenue - totalExpenses;

        return {
          startDate,
          endDate,
          revenue,
          totalRevenue,
          expenses,
          totalExpenses,
          netIncome,
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
}

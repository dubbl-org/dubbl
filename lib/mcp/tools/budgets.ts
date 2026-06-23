import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import { budget, budgetLine, budgetPeriod, journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and, desc, sql, isNull, gte, lte } from "drizzle-orm";
import { notDeleted, softDelete } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { generatePeriods, distributeAmount } from "@/lib/budget-periods";
import type { PeriodType } from "@/lib/budget-periods";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/**
 * MCP tools for budgets: a named plan with one line per chart-of-accounts
 * account, each line broken into time periods (monthly/weekly/etc) within the
 * budget's date range, plus a budget-vs-actual report that compares each line's
 * plan against posted general-ledger activity.
 *
 * All monetary amounts — both INPUTS and RESULTS — are integer cents (e.g.
 * $12.50 = 1250). Direct DB access via Drizzle (no HTTP self-calls); every
 * query is scoped to the AuthContext's organization.
 */
const PERIOD_TYPES = ["monthly", "weekly", "daily", "quarterly", "yearly", "custom"] as const;

export function registerBudgetTools(server: McpServer, ctx: AuthContext) {
  server.tool(
    "list_budgets",
    "List budgets for the organization with pagination, newest first. Each budget includes its fiscal year (when set). Returns the budgets and the total count. The period amounts and line totals on budgets are in integer cents.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Number of budgets to return (max 100)"),
      page: z.number().int().min(1).optional().default(1).describe("Page number (1-based)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const conditions = [
          eq(budget.organizationId, ctx.organizationId),
          notDeleted(budget.deletedAt),
        ];

        const offset = (params.page - 1) * params.limit;
        const budgets = await db.query.budget.findMany({
          where: and(...conditions),
          orderBy: desc(budget.createdAt),
          limit: params.limit,
          offset,
          with: { fiscalYear: true },
        });

        const [countResult] = await db
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(budget)
          .where(and(...conditions));

        return { budgets, total: Number(countResult?.count || 0) };
      })
  );

  server.tool(
    "get_budget",
    "Get a single budget by ID with its fiscal year and each budget line (with its chart account and the per-period breakdown). Line totals and period amounts are in integer cents.",
    {
      budgetId: z.string().describe("The UUID of the budget"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.budget.findFirst({
          where: and(
            eq(budget.id, params.budgetId),
            eq(budget.organizationId, ctx.organizationId),
            notDeleted(budget.deletedAt)
          ),
          with: {
            fiscalYear: true,
            lines: {
              with: {
                account: true,
                periods: true,
              },
            },
          },
        });
        if (!found) throw new Error("Budget not found");
        return { budget: found };
      })
  );

  server.tool(
    "create_budget",
    "Create a budget with one line per chart account. Each line is broken into time periods spanning the budget's date range. For a line, either pass explicit `periods` (each with an amount in integer cents) or pass a `total` in integer cents and omit periods — the total is then auto-distributed evenly across the periods generated for the chosen periodType. When neither periods nor total is given the line total is 0. A line's stored total is its provided `total`, otherwise the sum of its period amounts. Returns the created budget (header only).",
    {
      name: z.string().min(1).describe("Budget name"),
      fiscalYearId: z
        .string()
        .nullable()
        .optional()
        .describe("Optional fiscal year UUID this budget belongs to"),
      startDate: z.string().describe("Budget start date (YYYY-MM-DD)"),
      endDate: z.string().describe("Budget end date (YYYY-MM-DD)"),
      periodType: z
        .enum(PERIOD_TYPES)
        .optional()
        .default("monthly")
        .describe(
          "How the date range is split into periods when periods are auto-generated: 'monthly' (default), 'weekly', 'daily', 'quarterly', 'yearly', or 'custom' (one period covering the whole range)."
        ),
      isActive: z
        .boolean()
        .optional()
        .default(true)
        .describe("Whether the budget is active (default true)"),
      lines: z
        .array(
          z.object({
            accountId: z.string().min(1).describe("Chart-of-accounts account UUID for this line"),
            total: z
              .number()
              .int()
              .optional()
              .describe(
                "Line total in integer cents. When set and periods are omitted, this is auto-distributed evenly across the generated periods."
              ),
            periods: z
              .array(
                z.object({
                  label: z.string().min(1).describe("Period label (e.g. 'Jan 2026')"),
                  startDate: z.string().min(1).describe("Period start date (YYYY-MM-DD)"),
                  endDate: z.string().min(1).describe("Period end date (YYYY-MM-DD)"),
                  amount: z
                    .number()
                    .int()
                    .optional()
                    .default(0)
                    .describe("Budgeted amount for this period in integer cents"),
                  sortOrder: z
                    .number()
                    .int()
                    .optional()
                    .default(0)
                    .describe("Display order of this period (0-based)"),
                })
              )
              .optional()
              .describe(
                "Explicit per-period amounts (integer cents). Omit to auto-generate periods from periodType and distribute `total` evenly."
              ),
          })
        )
        .min(1)
        .describe("Budget lines (at least one)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:budgets");

        const [created] = await db
          .insert(budget)
          .values({
            organizationId: ctx.organizationId,
            name: params.name,
            fiscalYearId: params.fiscalYearId || null,
            startDate: params.startDate,
            endDate: params.endDate,
            periodType: params.periodType,
            isActive: params.isActive,
          })
          .returning();

        for (const line of params.lines) {
          let periods = line.periods;
          if (!periods || periods.length === 0) {
            const generated = generatePeriods(
              params.periodType as PeriodType,
              params.startDate,
              params.endDate
            );
            const total = line.total || 0;
            const amounts = distributeAmount(total, generated.length);
            periods = generated.map((p, i) => ({ ...p, amount: amounts[i] }));
          }

          const total = line.total ?? periods.reduce((s, p) => s + p.amount, 0);

          const [createdLine] = await db
            .insert(budgetLine)
            .values({
              budgetId: created.id,
              accountId: line.accountId,
              total,
            })
            .returning();

          if (periods.length > 0) {
            await db.insert(budgetPeriod).values(
              periods.map((p) => ({
                budgetLineId: createdLine.id,
                label: p.label,
                startDate: p.startDate,
                endDate: p.endDate,
                amount: p.amount,
                sortOrder: p.sortOrder,
              }))
            );
          }
        }

        return { budget: created };
      })
  );

  server.tool(
    "update_budget",
    "Update a budget. Header fields (name, fiscalYearId, startDate, endDate, periodType, isActive) are updated in place. If `lines` is provided it REPLACES all existing lines and their periods: the old lines are deleted (periods cascade) and the supplied lines are recreated using the same rules as create_budget (explicit periods, or `total` distributed across auto-generated periods from the effective periodType/date range). Omit `lines` to leave lines untouched. Amounts are in integer cents. Returns the updated budget (header only).",
    {
      budgetId: z.string().describe("The UUID of the budget to update"),
      name: z.string().min(1).optional().describe("New budget name"),
      fiscalYearId: z
        .string()
        .nullable()
        .optional()
        .describe("Fiscal year UUID, or null to clear it"),
      startDate: z.string().optional().describe("New start date (YYYY-MM-DD)"),
      endDate: z.string().optional().describe("New end date (YYYY-MM-DD)"),
      periodType: z
        .enum(PERIOD_TYPES)
        .optional()
        .describe(
          "New period type used for auto-generating periods when lines are replaced: 'monthly', 'weekly', 'daily', 'quarterly', 'yearly', or 'custom'."
        ),
      isActive: z.boolean().optional().describe("Whether the budget is active"),
      lines: z
        .array(
          z.object({
            accountId: z.string().min(1).describe("Chart-of-accounts account UUID for this line"),
            total: z
              .number()
              .int()
              .optional()
              .describe(
                "Line total in integer cents. When set and periods are omitted, this is auto-distributed evenly across the generated periods."
              ),
            periods: z
              .array(
                z.object({
                  label: z.string().min(1).describe("Period label (e.g. 'Jan 2026')"),
                  startDate: z.string().min(1).describe("Period start date (YYYY-MM-DD)"),
                  endDate: z.string().min(1).describe("Period end date (YYYY-MM-DD)"),
                  amount: z
                    .number()
                    .int()
                    .optional()
                    .default(0)
                    .describe("Budgeted amount for this period in integer cents"),
                  sortOrder: z
                    .number()
                    .int()
                    .optional()
                    .default(0)
                    .describe("Display order of this period (0-based)"),
                })
              )
              .optional()
              .describe(
                "Explicit per-period amounts (integer cents). Omit to auto-generate periods from periodType and distribute `total` evenly."
              ),
          })
        )
        .optional()
        .describe(
          "When provided, REPLACES all existing lines and periods. Omit to leave the budget's lines unchanged."
        ),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:budgets");

        const existing = await db.query.budget.findFirst({
          where: and(
            eq(budget.id, params.budgetId),
            eq(budget.organizationId, ctx.organizationId),
            notDeleted(budget.deletedAt)
          ),
        });
        if (!existing) throw new Error("Budget not found");

        const { budgetId, lines, ...budgetFields } = params;

        const [updated] = await db
          .update(budget)
          .set({ ...budgetFields, updatedAt: new Date() })
          .where(eq(budget.id, budgetId))
          .returning();

        if (lines) {
          // Delete old lines (periods cascade)
          await db.delete(budgetLine).where(eq(budgetLine.budgetId, budgetId));

          const periodType = (params.periodType || existing.periodType) as PeriodType;
          const startDate = params.startDate || existing.startDate;
          const endDate = params.endDate || existing.endDate;

          for (const line of lines) {
            let periods = line.periods;
            if (!periods || periods.length === 0) {
              const generated = generatePeriods(periodType, startDate, endDate);
              const total = line.total || 0;
              const amounts = distributeAmount(total, generated.length);
              periods = generated.map((p, i) => ({ ...p, amount: amounts[i] }));
            }

            const total = line.total ?? periods.reduce((s, p) => s + p.amount, 0);

            const [createdLine] = await db
              .insert(budgetLine)
              .values({
                budgetId,
                accountId: line.accountId,
                total,
              })
              .returning();

            if (periods.length > 0) {
              await db.insert(budgetPeriod).values(
                periods.map((p) => ({
                  budgetLineId: createdLine.id,
                  label: p.label,
                  startDate: p.startDate,
                  endDate: p.endDate,
                  amount: p.amount,
                  sortOrder: p.sortOrder,
                }))
              );
            }
          }
        }

        return { budget: updated };
      })
  );

  server.tool(
    "delete_budget",
    "Soft-delete a budget by ID (it stops appearing in lists/reports but is retained). Returns { success: true } on success.",
    {
      budgetId: z.string().describe("The UUID of the budget to delete"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:budgets");

        const existing = await db.query.budget.findFirst({
          where: and(
            eq(budget.id, params.budgetId),
            eq(budget.organizationId, ctx.organizationId),
            notDeleted(budget.deletedAt)
          ),
        });
        if (!existing) throw new Error("Budget not found");

        await db.update(budget).set(softDelete()).where(eq(budget.id, params.budgetId));

        return { success: true };
      })
  );

  server.tool(
    "budget_vs_actual",
    "Budget-vs-actual report for one budget. For each budget line it compares the budgeted amount against actual posted general-ledger activity for that account within the budget's date range, with a per-period breakdown, variance (budgeted − actual), variance percent, and a burn-rate projection (actual / days elapsed × total days). Actuals are natural-signed by account type (expense/asset = debit − credit; otherwise credit − debit). All amounts are in integer cents. Pass budgetId to target a specific budget; if omitted the most recent non-deleted budget is used. Returns null budget and zeroed totals when no budget exists.",
    {
      budgetId: z
        .string()
        .optional()
        .describe("UUID of the budget to report on. Omit to use the most recent non-deleted budget."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const found = await db.query.budget.findFirst({
          where: params.budgetId
            ? and(
                eq(budget.id, params.budgetId),
                eq(budget.organizationId, ctx.organizationId),
                isNull(budget.deletedAt)
              )
            : and(eq(budget.organizationId, ctx.organizationId), isNull(budget.deletedAt)),
          with: {
            lines: {
              with: {
                account: true,
                periods: true,
              },
            },
          },
        });

        if (!found) {
          return {
            budget: null,
            comparisons: [],
            totalBudgeted: 0,
            totalActual: 0,
            totalVariance: 0,
            totalBurnRate: 0,
            daysElapsed: 0,
            daysRemaining: 0,
            totalDays: 0,
          };
        }

        // Actual GL balances per account across the budget's full date range.
        const actuals = await db
          .select({
            accountId: journalLine.accountId,
            debit: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`.as("debit"),
            credit: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`.as("credit"),
          })
          .from(journalLine)
          .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
          .where(
            and(
              eq(journalEntry.organizationId, ctx.organizationId),
              eq(journalEntry.status, "posted"),
              isNull(journalEntry.deletedAt),
              gte(journalEntry.date, found.startDate),
              lte(journalEntry.date, found.endDate)
            )
          )
          .groupBy(journalLine.accountId);

        const actualMap = new Map<string, { debit: number; credit: number }>();
        for (const row of actuals) {
          actualMap.set(row.accountId, {
            debit: Number(row.debit),
            credit: Number(row.credit),
          });
        }

        // Per-period actuals, fetched once per unique date range.
        const allPeriods = found.lines.flatMap((l) =>
          (l.periods || []).map((p) => ({
            accountId: l.accountId,
            periodId: p.id,
            startDate: p.startDate,
            endDate: p.endDate,
          }))
        );

        const periodActualMap = new Map<string, { debit: number; credit: number }>();

        if (allPeriods.length > 0) {
          const uniqueDateRanges = new Map<string, { startDate: string; endDate: string }>();
          for (const p of allPeriods) {
            uniqueDateRanges.set(`${p.startDate}_${p.endDate}`, {
              startDate: p.startDate,
              endDate: p.endDate,
            });
          }

          for (const range of uniqueDateRanges.values()) {
            const periodActuals = await db
              .select({
                accountId: journalLine.accountId,
                debit: sql<number>`COALESCE(SUM(${journalLine.debitAmount}), 0)`.as("debit"),
                credit: sql<number>`COALESCE(SUM(${journalLine.creditAmount}), 0)`.as("credit"),
              })
              .from(journalLine)
              .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
              .where(
                and(
                  eq(journalEntry.organizationId, ctx.organizationId),
                  eq(journalEntry.status, "posted"),
                  isNull(journalEntry.deletedAt),
                  gte(journalEntry.date, range.startDate),
                  lte(journalEntry.date, range.endDate)
                )
              )
              .groupBy(journalLine.accountId);

            for (const pa of periodActuals) {
              const key = `${pa.accountId}_${range.startDate}_${range.endDate}`;
              periodActualMap.set(key, {
                debit: Number(pa.debit),
                credit: Number(pa.credit),
              });
            }
          }
        }

        // Days, for burn-rate projection.
        const startMs = new Date(found.startDate + "T00:00:00").getTime();
        const endMs = new Date(found.endDate + "T00:00:00").getTime();
        const nowMs = Date.now();
        const totalDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
        const daysElapsed = Math.max(
          0,
          Math.min(totalDays, Math.round((nowMs - startMs) / 86400000))
        );
        const daysRemaining = Math.max(0, totalDays - daysElapsed);

        function computeActual(
          accountType: string | undefined,
          actData: { debit: number; credit: number } | undefined
        ): number {
          if (!actData) return 0;
          if (accountType === "expense" || accountType === "asset") {
            return actData.debit - actData.credit;
          }
          return actData.credit - actData.debit;
        }

        const comparisons = found.lines.map((line) => {
          const act = actualMap.get(line.accountId);
          const accountType = line.account?.type;
          const actualAmount = computeActual(accountType, act);
          const budgeted = line.total;
          const variance = budgeted - actualAmount;
          const variancePct = budgeted === 0 ? 0 : Math.round((variance / budgeted) * 100);

          const sortedPeriods = [...(line.periods || [])].sort((a, b) => a.sortOrder - b.sortOrder);
          const periodBreakdown = sortedPeriods.map((p) => {
            const key = `${line.accountId}_${p.startDate}_${p.endDate}`;
            const pAct = periodActualMap.get(key);
            const periodActual = computeActual(accountType, pAct);
            return {
              id: p.id,
              label: p.label,
              startDate: p.startDate,
              endDate: p.endDate,
              budgeted: p.amount,
              actual: periodActual,
              variance: p.amount - periodActual,
              sortOrder: p.sortOrder,
            };
          });

          const burnRate =
            daysElapsed > 0 ? Math.round((actualAmount / daysElapsed) * totalDays) : 0;

          return {
            accountId: line.accountId,
            accountName: line.account?.name || "Unknown",
            accountCode: line.account?.code || "",
            budgeted,
            actual: actualAmount,
            variance,
            variancePct,
            burnRate,
            projected: burnRate,
            periods: periodBreakdown,
          };
        });

        const totalBudgeted = comparisons.reduce((s, c) => s + c.budgeted, 0);
        const totalActual = comparisons.reduce((s, c) => s + c.actual, 0);
        const totalVariance = totalBudgeted - totalActual;
        const totalBurnRate =
          daysElapsed > 0 ? Math.round((totalActual / daysElapsed) * totalDays) : 0;

        return {
          budget: {
            id: found.id,
            name: found.name,
            startDate: found.startDate,
            endDate: found.endDate,
            periodType: found.periodType,
          },
          comparisons,
          totalBudgeted,
          totalActual,
          totalVariance,
          totalBurnRate,
          daysElapsed,
          daysRemaining,
          totalDays,
        };
      })
  );
}

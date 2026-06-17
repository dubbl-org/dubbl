import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  project,
  projectMember,
  projectBillableItem,
  member,
  timeEntry,
  invoice,
  invoiceLine,
  bill,
  billLine,
  journalLine,
  journalEntry,
  chartAccount,
} from "@/lib/db/schema";
import { eq, and, gte, lte, sql, notInArray, isNull, inArray } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { requireRole } from "@/lib/api/require-role";
import { wrapTool } from "@/lib/mcp/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/** Billed amount for a cost line = cost grossed up by the markup (basis points). */
function withMarkup(cost: number, markupBasisPoints: number): number {
  return Math.round(cost * (1 + markupBasisPoints / 10000));
}

export function registerProjectTools(server: McpServer, ctx: AuthContext) {
  // ─── Job-costing profitability ─────────────────────────────────────────
  server.tool(
    "get_project_profitability",
    "Job-costing profitability per project (estimate vs actual). ACTUAL revenue is the sum of invoice lines tagged with the project; ACTUAL cost is bill lines tagged with the project (materials/subcontractors) + posted expense-account journal lines tagged with the project (excluding bill-sourced entries) + labor (time entries costed at each project member's internal costRate, NOT the client billing rate). Compares actuals to project.budget (total cost budget) and estimatedHours. All amounts in integer cents; hours/minutes in minutes. Pass an optional date range (defaults: Jan 1 of the current year to today) and an optional projectId to scope to one project.",
    {
      projectId: z
        .string()
        .optional()
        .describe("Limit to a single project UUID. Omit for all projects."),
      startDate: z
        .string()
        .optional()
        .describe("Start date inclusive (YYYY-MM-DD). Default: Jan 1 this year."),
      endDate: z
        .string()
        .optional()
        .describe("End date inclusive (YYYY-MM-DD). Default: today."),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const startDate = params.startDate || `${new Date().getFullYear()}-01-01`;
        const endDate = params.endDate || new Date().toISOString().slice(0, 10);

        const projects = await db
          .select()
          .from(project)
          .where(
            and(
              eq(project.organizationId, ctx.organizationId),
              isNull(project.deletedAt),
              params.projectId ? eq(project.id, params.projectId) : undefined
            )
          );

        if (projects.length === 0) {
          return { startDate, endDate, projects: [], totalRevenue: 0, totalCost: 0, totalProfit: 0 };
        }
        const projectIds = projects.map((p) => p.id);

        // ACTUAL revenue: invoice lines tagged with the project.
        const revenueRows = await db
          .select({
            projectId: invoiceLine.projectId,
            revenue: sql<number>`COALESCE(SUM(${invoiceLine.amount}), 0)`,
          })
          .from(invoiceLine)
          .innerJoin(invoice, eq(invoiceLine.invoiceId, invoice.id))
          .where(
            and(
              eq(invoice.organizationId, ctx.organizationId),
              inArray(invoiceLine.projectId, projectIds),
              notInArray(invoice.status, ["draft", "void"]),
              gte(invoice.issueDate, startDate),
              lte(invoice.issueDate, endDate)
            )
          )
          .groupBy(invoiceLine.projectId);
        const revenueMap = new Map(revenueRows.map((r) => [r.projectId as string, Number(r.revenue)]));

        // ACTUAL material cost: bill lines tagged with the project.
        const billRows = await db
          .select({
            projectId: billLine.projectId,
            cost: sql<number>`COALESCE(SUM(${billLine.amount}), 0)`,
          })
          .from(billLine)
          .innerJoin(bill, eq(billLine.billId, bill.id))
          .where(
            and(
              eq(bill.organizationId, ctx.organizationId),
              inArray(billLine.projectId, projectIds),
              notInArray(bill.status, ["draft", "void"]),
              gte(bill.issueDate, startDate),
              lte(bill.issueDate, endDate)
            )
          )
          .groupBy(billLine.projectId);
        const billMap = new Map(billRows.map((r) => [r.projectId as string, Number(r.cost)]));

        // ACTUAL other direct cost: posted expense-account journal lines tagged
        // with the project, excluding bill-sourced entries (avoid double count).
        const journalRows = await db
          .select({
            projectId: journalLine.projectId,
            cost: sql<number>`COALESCE(SUM(${journalLine.debitAmount} - ${journalLine.creditAmount}), 0)`,
          })
          .from(journalLine)
          .innerJoin(journalEntry, eq(journalLine.journalEntryId, journalEntry.id))
          .innerJoin(chartAccount, eq(journalLine.accountId, chartAccount.id))
          .where(
            and(
              eq(journalEntry.organizationId, ctx.organizationId),
              inArray(journalLine.projectId, projectIds),
              eq(journalEntry.status, "posted"),
              eq(chartAccount.type, "expense"),
              notInArray(journalEntry.sourceType, ["bill"]),
              gte(journalEntry.date, startDate),
              lte(journalEntry.date, endDate)
            )
          )
          .groupBy(journalLine.projectId);
        const journalMap = new Map(journalRows.map((r) => [r.projectId as string, Number(r.cost)]));

        // ACTUAL labor cost: time entries costed at the member's internal costRate.
        const timeRows = await db
          .select({
            projectId: timeEntry.projectId,
            userId: timeEntry.userId,
            minutes: sql<number>`COALESCE(SUM(${timeEntry.minutes}), 0)`,
            billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.isBillable} THEN ${timeEntry.minutes} ELSE 0 END), 0)`,
          })
          .from(timeEntry)
          .where(
            and(
              inArray(timeEntry.projectId, projectIds),
              gte(timeEntry.date, startDate),
              lte(timeEntry.date, endDate)
            )
          )
          .groupBy(timeEntry.projectId, timeEntry.userId);

        const rateRows = await db
          .select({
            projectId: projectMember.projectId,
            userId: member.userId,
            costRate: projectMember.costRate,
          })
          .from(projectMember)
          .innerJoin(member, eq(projectMember.memberId, member.id))
          .where(inArray(projectMember.projectId, projectIds));
        const rateMap = new Map(rateRows.map((m) => [`${m.projectId}:${m.userId}`, m.costRate ?? 0]));

        const laborMap = new Map<string, { laborCost: number; minutes: number; billableMinutes: number }>();
        for (const t of timeRows) {
          const pid = t.projectId as string;
          const minutes = Number(t.minutes);
          const billableMinutes = Number(t.billableMinutes);
          const rate = rateMap.get(`${pid}:${t.userId}`) ?? 0;
          const agg = laborMap.get(pid) || { laborCost: 0, minutes: 0, billableMinutes: 0 };
          agg.laborCost += Math.round((minutes / 60) * rate);
          agg.minutes += minutes;
          agg.billableMinutes += billableMinutes;
          laborMap.set(pid, agg);
        }

        const rows = projects.map((p) => {
          const revenue = revenueMap.get(p.id) || 0;
          const materialCost = billMap.get(p.id) || 0;
          const otherCost = journalMap.get(p.id) || 0;
          const labor = laborMap.get(p.id) || { laborCost: 0, minutes: 0, billableMinutes: 0 };
          const cost = materialCost + otherCost + labor.laborCost;
          const profit = revenue - cost;
          return {
            projectId: p.id,
            projectName: p.name,
            status: p.status,
            billingType: p.billingType,
            budget: p.budget,
            estimatedHours: p.estimatedHours,
            revenue,
            cost,
            materialCost,
            otherCost,
            laborCost: labor.laborCost,
            profit,
            marginPercent: revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0,
            actualMinutes: labor.minutes,
            billableMinutes: labor.billableMinutes,
            budgetVariance: p.budget - cost,
            budgetUsedPercent: p.budget > 0 ? Math.round((cost / p.budget) * 10000) / 100 : 0,
            hoursVariance: p.estimatedHours - labor.minutes,
            hoursUsedPercent:
              p.estimatedHours > 0 ? Math.round((labor.minutes / p.estimatedHours) * 10000) / 100 : 0,
          };
        });

        const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
        const totalCost = rows.reduce((s, r) => s + r.cost, 0);
        return {
          startDate,
          endDate,
          projects: rows.sort((a, b) => b.profit - a.profit),
          totalRevenue,
          totalCost,
          totalProfit: totalRevenue - totalCost,
        };
      })
  );

  // ─── Billable expenses ─────────────────────────────────────────────────
  server.tool(
    "list_project_billable_items",
    "List a project's billable expenses (costs to on-bill to the client). Returns: registered (not-yet-billed items, with billableAmount = cost + markup), billed (already on-billed, history), and candidates (bill lines tagged with this project that are not yet registered as billable). All amounts in integer cents; markup is in basis points (1000 = 10%).",
    {
      projectId: z.string().describe("Project UUID"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        const proj = await db.query.project.findFirst({
          where: and(
            eq(project.id, params.projectId),
            eq(project.organizationId, ctx.organizationId),
            notDeleted(project.deletedAt)
          ),
        });
        if (!proj) throw new Error("Project not found");

        const items = await db
          .select()
          .from(projectBillableItem)
          .where(
            and(
              eq(projectBillableItem.organizationId, ctx.organizationId),
              eq(projectBillableItem.projectId, params.projectId)
            )
          );

        const registered = items
          .filter((i) => i.billedInvoiceId == null)
          .map((i) => ({
            id: i.id,
            sourceType: i.sourceType,
            sourceLineId: i.sourceLineId,
            description: i.description,
            costAmount: i.costAmount,
            markupBasisPoints: i.markupBasisPoints,
            billableAmount: withMarkup(i.costAmount, i.markupBasisPoints),
          }));
        const billed = items
          .filter((i) => i.billedInvoiceId != null)
          .map((i) => ({
            id: i.id,
            sourceType: i.sourceType,
            sourceLineId: i.sourceLineId,
            description: i.description,
            costAmount: i.costAmount,
            billedAmount: i.billedAmount,
            billedInvoiceId: i.billedInvoiceId,
          }));

        const registeredBillLineIds = items
          .filter((i) => i.sourceType === "bill_line")
          .map((i) => i.sourceLineId);
        const candidateRows = await db
          .select({
            lineId: billLine.id,
            description: billLine.description,
            amount: billLine.amount,
            billNumber: bill.billNumber,
          })
          .from(billLine)
          .innerJoin(bill, eq(billLine.billId, bill.id))
          .where(
            and(
              eq(bill.organizationId, ctx.organizationId),
              eq(billLine.projectId, params.projectId),
              notInArray(bill.status, ["draft", "void"]),
              registeredBillLineIds.length > 0
                ? notInArray(billLine.id, registeredBillLineIds)
                : undefined
            )
          );
        const candidates = candidateRows.map((r) => ({
          sourceType: "bill_line" as const,
          sourceLineId: r.lineId,
          description: r.description,
          costAmount: r.amount,
          billNumber: r.billNumber,
        }));

        return {
          projectId: params.projectId,
          registered,
          billed,
          candidates,
          registeredBillableTotal: registered.reduce((s, i) => s + i.billableAmount, 0),
        };
      })
  );

  server.tool(
    "register_project_billable_item",
    "Register a cost line (typically a bill line) as a billable expense for a project so it can be on-billed to the client. For a bill_line, the cost and description are read from the line when not supplied. markupBasisPoints (1000 = 10%) is applied when the item is invoiced. Idempotent per (project, source line): re-registering updates the markup/description. Amounts in integer cents.",
    {
      projectId: z.string().describe("Project UUID"),
      sourceType: z
        .enum(["bill_line", "expense_item", "journal_line"])
        .default("bill_line")
        .describe("Kind of source cost line"),
      sourceLineId: z.string().describe("Id of the source cost line (e.g. bill_line.id)"),
      description: z.string().optional().describe("Override description (defaults to the bill line's)"),
      costAmount: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Cost in cents; resolved from the bill line when omitted"),
      markupBasisPoints: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Markup applied on-billing, basis points (1000 = 10%)"),
    },
    (params) =>
      wrapTool(ctx, async () => {
        requireRole(ctx, "manage:projects");
        const proj = await db.query.project.findFirst({
          where: and(
            eq(project.id, params.projectId),
            eq(project.organizationId, ctx.organizationId),
            notDeleted(project.deletedAt)
          ),
        });
        if (!proj) throw new Error("Project not found");

        let costAmount = params.costAmount;
        let description = params.description;
        if (params.sourceType === "bill_line") {
          const [src] = await db
            .select({ amount: billLine.amount, description: billLine.description })
            .from(billLine)
            .innerJoin(bill, eq(billLine.billId, bill.id))
            .where(
              and(
                eq(bill.organizationId, ctx.organizationId),
                eq(billLine.id, params.sourceLineId)
              )
            );
          if (!src) throw new Error("Bill line not found in this organization");
          costAmount = costAmount ?? src.amount;
          description = description ?? src.description;
        }
        if (costAmount == null) throw new Error("costAmount is required for this source type");

        const [row] = await db
          .insert(projectBillableItem)
          .values({
            organizationId: ctx.organizationId,
            projectId: params.projectId,
            sourceType: params.sourceType,
            sourceLineId: params.sourceLineId,
            description: description ?? "Billable expense",
            costAmount,
            markupBasisPoints: params.markupBasisPoints,
          })
          .onConflictDoUpdate({
            target: [
              projectBillableItem.projectId,
              projectBillableItem.sourceType,
              projectBillableItem.sourceLineId,
            ],
            set: {
              description: description ?? "Billable expense",
              costAmount,
              markupBasisPoints: params.markupBasisPoints,
            },
          })
          .returning({ id: projectBillableItem.id });

        return {
          id: row.id,
          billableAmount: withMarkup(costAmount, params.markupBasisPoints),
        };
      })
  );
}

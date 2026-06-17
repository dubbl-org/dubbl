import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  invoice,
  invoiceLine,
  bill,
  billLine,
  contact,
  project,
  projectMember,
  member,
  timeEntry,
  journalLine,
  journalEntry,
  chartAccount,
} from "@/lib/db/schema";
import { eq, and, gte, lte, sql, notInArray, isNull, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const startDate =
      url.searchParams.get("startDate") ||
      `${new Date().getFullYear()}-01-01`;
    const endDate =
      url.searchParams.get("endDate") ||
      new Date().toISOString().slice(0, 10);
    const groupBy = url.searchParams.get("groupBy") || "contact"; // "contact" or "project"

    if (groupBy === "contact") {
      // Revenue per contact (from invoices)
      const revenueByContact = await db
        .select({
          contactId: invoice.contactId,
          contactName: contact.name,
          revenue: sql<number>`COALESCE(SUM(${invoice.total}), 0)`,
          invoiceCount: sql<number>`COUNT(*)`,
        })
        .from(invoice)
        .innerJoin(contact, eq(invoice.contactId, contact.id))
        .where(
          and(
            eq(invoice.organizationId, ctx.organizationId),
            notInArray(invoice.status, ["draft", "void"]),
            gte(invoice.issueDate, startDate),
            lte(invoice.issueDate, endDate)
          )
        )
        .groupBy(invoice.contactId, contact.name);

      // Costs per contact (from bills)
      const costsByContact = await db
        .select({
          contactId: bill.contactId,
          costs: sql<number>`COALESCE(SUM(${bill.total}), 0)`,
          billCount: sql<number>`COUNT(*)`,
        })
        .from(bill)
        .where(
          and(
            eq(bill.organizationId, ctx.organizationId),
            notInArray(bill.status, ["draft", "void"]),
            gte(bill.issueDate, startDate),
            lte(bill.issueDate, endDate)
          )
        )
        .groupBy(bill.contactId);

      // Merge into profitability data
      const costMap = new Map(
        costsByContact.map((c) => [c.contactId, { costs: Number(c.costs), billCount: Number(c.billCount) }])
      );

      const profitability = revenueByContact
        .map((r) => {
          const rev = Number(r.revenue);
          const cost = costMap.get(r.contactId);
          const costs = cost?.costs || 0;
          const profit = rev - costs;
          const margin = rev > 0 ? Math.round((profit / rev) * 10000) / 100 : 0;

          return {
            contactId: r.contactId,
            contactName: r.contactName,
            revenue: rev,
            costs,
            profit,
            margin,
            invoiceCount: Number(r.invoiceCount),
            billCount: cost?.billCount || 0,
          };
        })
        .sort((a, b) => b.profit - a.profit);

      const totalRevenue = profitability.reduce((s, p) => s + p.revenue, 0);
      const totalCosts = profitability.reduce((s, p) => s + p.costs, 0);

      return NextResponse.json({
        startDate,
        endDate,
        groupBy,
        entries: profitability,
        totalRevenue,
        totalCosts,
        totalProfit: totalRevenue - totalCosts,
        overallMargin: totalRevenue > 0 ? Math.round(((totalRevenue - totalCosts) / totalRevenue) * 10000) / 100 : 0,
      });
    }

    // ── Project (job-costing) profitability ───────────────────────────────
    // Estimate-vs-actual: ACTUAL revenue/cost is aggregated from documents that
    // carry a projectId on their LINES (job-costing dimension), not estimated
    // off project budgets. Comparison baselines come from project.budget /
    // estimatedHours / fixedPrice on the project record.
    const projects = await db
      .select()
      .from(project)
      .where(
        and(
          eq(project.organizationId, ctx.organizationId),
          isNull(project.deletedAt)
        )
      );

    if (projects.length === 0) {
      return NextResponse.json({
        startDate,
        endDate,
        groupBy,
        entries: [],
        totalRevenue: 0,
        totalCosts: 0,
        totalProfit: 0,
        overallMargin: 0,
      });
    }

    const projectIds = projects.map((p) => p.id);

    // ACTUAL revenue: invoice lines tagged with a projectId, on non-draft/void
    // invoices within the date range (line.amount is tax-exclusive net revenue).
    const revenueByProject = await db
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

    const revenueMap = new Map(
      revenueByProject.map((r) => [r.projectId as string, Number(r.revenue)])
    );

    // ACTUAL material/subcontractor cost: bill lines tagged with a projectId, on
    // non-draft/void bills within the date range (line.amount is net cost).
    const billCostByProject = await db
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

    const billCostMap = new Map(
      billCostByProject.map((r) => [r.projectId as string, Number(r.cost)])
    );

    // ACTUAL other direct cost: posted journal lines tagged with a projectId that
    // hit an EXPENSE account (net debit). Captures direct costs booked straight
    // to the GL (expense claims, manual journals, categorized bank spend) without
    // double-counting bill-sourced expenses — those bill lines capitalize/expense
    // via journals too, so we exclude journal entries sourced from "bill".
    const journalCostByProject = await db
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
          // Exclude bill-sourced journals to avoid double counting with bill lines.
          notInArray(journalEntry.sourceType, ["bill"]),
          gte(journalEntry.date, startDate),
          lte(journalEntry.date, endDate)
        )
      )
      .groupBy(journalLine.projectId);

    const journalCostMap = new Map(
      journalCostByProject.map((r) => [r.projectId as string, Number(r.cost)])
    );

    // ACTUAL labor cost + hours: time entries within the range, costed at the
    // member's internal COST rate (projectMember.costRate), NOT the billing rate.
    // costRate is keyed by project + member.userId (member -> user via member).
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

    // Internal cost rates per project member, indexed by `${projectId}:${userId}`.
    const memberRates = await db
      .select({
        projectId: projectMember.projectId,
        userId: member.userId,
        costRate: projectMember.costRate,
      })
      .from(projectMember)
      .innerJoin(member, eq(projectMember.memberId, member.id))
      .where(inArray(projectMember.projectId, projectIds));

    const costRateMap = new Map(
      memberRates.map((m) => [`${m.projectId}:${m.userId}`, m.costRate ?? 0])
    );

    // Aggregate labor per project from the per-(project,user) time rows.
    const laborMap = new Map<
      string,
      { laborCost: number; totalMinutes: number; billableMinutes: number }
    >();
    for (const t of timeRows) {
      const pid = t.projectId as string;
      const minutes = Number(t.minutes);
      const billableMinutes = Number(t.billableMinutes);
      const costRate = costRateMap.get(`${pid}:${t.userId}`) ?? 0;
      const laborCost = Math.round((minutes / 60) * costRate);
      const agg = laborMap.get(pid) || {
        laborCost: 0,
        totalMinutes: 0,
        billableMinutes: 0,
      };
      agg.laborCost += laborCost;
      agg.totalMinutes += minutes;
      agg.billableMinutes += billableMinutes;
      laborMap.set(pid, agg);
    }

    const profitability = projects
      .map((p) => {
        const revenue = revenueMap.get(p.id) || 0;
        const materialCost = billCostMap.get(p.id) || 0;
        const otherCost = journalCostMap.get(p.id) || 0;
        const labor = laborMap.get(p.id) || {
          laborCost: 0,
          totalMinutes: 0,
          billableMinutes: 0,
        };
        const laborCost = labor.laborCost;
        const costs = materialCost + otherCost + laborCost;

        const profit = revenue - costs;
        const margin =
          revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0;

        // Estimate-vs-actual baselines.
        const budget = p.budget; // cents (total cost budget)
        const budgetVariance = budget - costs; // +ve = under budget
        const budgetUsedPercent =
          budget > 0 ? Math.round((costs / budget) * 10000) / 100 : 0;
        const estimatedHours = p.estimatedHours; // minutes
        const actualMinutes = labor.totalMinutes;
        const hoursVariance = estimatedHours - actualMinutes; // minutes, +ve = under estimate
        const hoursUsedPercent =
          estimatedHours > 0
            ? Math.round((actualMinutes / estimatedHours) * 10000) / 100
            : 0;

        return {
          projectId: p.id,
          projectName: p.name,
          status: p.status,
          billingType: p.billingType,
          // Estimate baselines
          budget,
          estimatedHours,
          fixedPrice: p.fixedPrice,
          hourlyRate: p.hourlyRate,
          // Actuals
          revenue,
          costs,
          materialCost,
          otherCost,
          laborCost,
          profit,
          margin,
          totalMinutes: labor.totalMinutes,
          billableMinutes: labor.billableMinutes,
          // Estimate vs actual
          budgetVariance,
          budgetUsedPercent,
          hoursVariance,
          hoursUsedPercent,
        };
      })
      .sort((a, b) => b.profit - a.profit);

    const totalRevenue = profitability.reduce((s, p) => s + p.revenue, 0);
    const totalCosts = profitability.reduce((s, p) => s + p.costs, 0);

    return NextResponse.json({
      startDate,
      endDate,
      groupBy,
      entries: profitability,
      totalRevenue,
      totalCosts,
      totalProfit: totalRevenue - totalCosts,
      overallMargin:
        totalRevenue > 0
          ? Math.round(((totalRevenue - totalCosts) / totalRevenue) * 10000) /
            100
          : 0,
    });
  } catch (err) {
    return handleError(err);
  }
}

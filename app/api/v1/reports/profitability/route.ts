import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  invoice,
  bill,
  contact,
  project,
  timeEntry,
} from "@/lib/db/schema";
import { eq, and, gte, lte, sql, notInArray, isNull } from "drizzle-orm";
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

    // Project profitability - uses time entries, project budgets, and linked invoices
    // Get all projects for this org
    const projects = await db
      .select()
      .from(project)
      .where(
        and(
          eq(project.organizationId, ctx.organizationId),
          isNull(project.deletedAt)
        )
      );

    // Get time entries within the date range grouped by project
    const timeByProject = await db
      .select({
        projectId: timeEntry.projectId,
        totalMinutes: sql<number>`COALESCE(SUM(${timeEntry.minutes}), 0)`,
        billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.isBillable} THEN ${timeEntry.minutes} ELSE 0 END), 0)`,
        laborCost: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.isBillable} THEN ROUND(${timeEntry.minutes}::numeric / 60 * ${timeEntry.hourlyRate}) ELSE 0 END), 0)`,
        invoicedEntries: sql<number>`COUNT(${timeEntry.invoiceId})`,
      })
      .from(timeEntry)
      .where(
        and(
          gte(timeEntry.date, startDate),
          lte(timeEntry.date, endDate)
        )
      )
      .groupBy(timeEntry.projectId);

    const timeMap = new Map(
      timeByProject.map((t) => [
        t.projectId,
        {
          totalMinutes: Number(t.totalMinutes),
          billableMinutes: Number(t.billableMinutes),
          laborCost: Number(t.laborCost),
          invoicedEntries: Number(t.invoicedEntries),
        },
      ])
    );

    // Get revenue from invoices linked to time entries per project
    const invoiceRevenueByProject = await db
      .select({
        projectId: timeEntry.projectId,
        revenue: sql<number>`COALESCE(SUM(DISTINCT ${invoice.total}), 0)`,
      })
      .from(timeEntry)
      .innerJoin(invoice, eq(timeEntry.invoiceId, invoice.id))
      .where(
        and(
          notInArray(invoice.status, ["draft", "void"]),
          gte(invoice.issueDate, startDate),
          lte(invoice.issueDate, endDate)
        )
      )
      .groupBy(timeEntry.projectId);

    const invoiceRevenueMap = new Map(
      invoiceRevenueByProject.map((r) => [r.projectId, Number(r.revenue)])
    );

    // Also get revenue from invoices linked via project's contact
    // (invoices to the project's contact within the date range)
    const contactInvoiceRevenue = await db
      .select({
        contactId: invoice.contactId,
        revenue: sql<number>`COALESCE(SUM(${invoice.total}), 0)`,
      })
      .from(invoice)
      .where(
        and(
          eq(invoice.organizationId, ctx.organizationId),
          notInArray(invoice.status, ["draft", "void"]),
          gte(invoice.issueDate, startDate),
          lte(invoice.issueDate, endDate)
        )
      )
      .groupBy(invoice.contactId);

    const contactRevenueMap = new Map(
      contactInvoiceRevenue.map((r) => [r.contactId, Number(r.revenue)])
    );

    const profitability = projects.map((p) => {
      const time = timeMap.get(p.id);
      const totalMinutes = time?.totalMinutes || 0;
      const billableMinutes = time?.billableMinutes || 0;

      // Revenue: prefer invoice-linked revenue, fall back to contact-linked, then use totalBilled
      let revenue = invoiceRevenueMap.get(p.id) || 0;
      if (revenue === 0 && p.contactId) {
        revenue = contactRevenueMap.get(p.contactId) || 0;
      }
      if (revenue === 0) {
        revenue = p.totalBilled;
      }

      // Cost: labor cost from time entries (hours * hourly rate)
      const costs = time?.laborCost || 0;

      const profit = revenue - costs;
      const margin =
        revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0;

      return {
        projectId: p.id,
        projectName: p.name,
        status: p.status,
        billingType: p.billingType,
        budget: p.budget,
        fixedPrice: p.fixedPrice,
        hourlyRate: p.hourlyRate,
        revenue,
        costs,
        profit,
        margin,
        totalMinutes,
        billableMinutes,
        estimatedHours: p.estimatedHours,
      };
    }).sort((a, b) => b.profit - a.profit);

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
          ? Math.round(
              ((totalRevenue - totalCosts) / totalRevenue) * 10000
            ) / 100
          : 0,
    });
  } catch (err) {
    return handleError(err);
  }
}

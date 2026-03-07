import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  invoice,
  bill,
  contact,
} from "@/lib/db/schema";
import { eq, and, gte, lte, sql, notInArray } from "drizzle-orm";
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

    // For project grouping - return empty for now since project-invoice linkage
    // would require a projectId on invoices/bills which may not exist yet
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
  } catch (err) {
    return handleError(err);
  }
}

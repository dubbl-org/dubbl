import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, invoiceLine, taxRate } from "@/lib/db/schema";
import { eq, and, gte, lte, isNull, sql, notInArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") || "";
    const endDate = url.searchParams.get("endDate") || "";

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
    }

    // Group by tax rate
    const taxBreakdown = await db
      .select({
        taxRateName: taxRate.name,
        taxRatePercent: taxRate.rate,
        taxableAmount: sql<number>`COALESCE(SUM(${invoiceLine.amount}), 0)`.mapWith(Number),
        taxCollected: sql<number>`COALESCE(SUM(${invoiceLine.taxAmount}), 0)`.mapWith(Number),
        invoiceCount: sql<number>`COUNT(DISTINCT ${invoice.id})`.mapWith(Number),
      })
      .from(invoiceLine)
      .innerJoin(invoice, eq(invoiceLine.invoiceId, invoice.id))
      .leftJoin(taxRate, eq(invoiceLine.taxRateId, taxRate.id))
      .where(and(
        eq(invoice.organizationId, ctx.organizationId),
        gte(invoice.issueDate, startDate),
        lte(invoice.issueDate, endDate),
        notInArray(invoice.status, ["draft", "void"]),
        isNull(invoice.deletedAt)
      ))
      .groupBy(taxRate.id, taxRate.name, taxRate.rate);

    // Exempt (no tax rate assigned)
    const exempt = await db
      .select({
        total: sql<number>`COALESCE(SUM(${invoiceLine.amount}), 0)`.mapWith(Number),
      })
      .from(invoiceLine)
      .innerJoin(invoice, eq(invoiceLine.invoiceId, invoice.id))
      .where(and(
        eq(invoice.organizationId, ctx.organizationId),
        gte(invoice.issueDate, startDate),
        lte(invoice.issueDate, endDate),
        notInArray(invoice.status, ["draft", "void"]),
        isNull(invoice.deletedAt),
        isNull(invoiceLine.taxRateId)
      ));

    return NextResponse.json({
      breakdown: taxBreakdown,
      exemptAmount: exempt[0]?.total || 0,
      period: { startDate, endDate },
    });
  } catch (err) {
    return handleError(err);
  }
}

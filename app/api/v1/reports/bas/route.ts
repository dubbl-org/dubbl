import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, invoiceLine, bill, billLine } from "@/lib/db/schema";
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

    // G1: Total sales
    const totalSales = await db
      .select({ total: sql<number>`COALESCE(SUM(${invoice.total}), 0)`.mapWith(Number) })
      .from(invoice)
      .where(and(
        eq(invoice.organizationId, ctx.organizationId),
        gte(invoice.issueDate, startDate),
        lte(invoice.issueDate, endDate),
        notInArray(invoice.status, ["draft", "void"]),
        isNull(invoice.deletedAt)
      ));

    // 1A: GST on sales
    const gstOnSales = await db
      .select({ total: sql<number>`COALESCE(SUM(${invoiceLine.taxAmount}), 0)`.mapWith(Number) })
      .from(invoiceLine)
      .innerJoin(invoice, eq(invoiceLine.invoiceId, invoice.id))
      .where(and(
        eq(invoice.organizationId, ctx.organizationId),
        gte(invoice.issueDate, startDate),
        lte(invoice.issueDate, endDate),
        notInArray(invoice.status, ["draft", "void"]),
        isNull(invoice.deletedAt)
      ));

    // Total purchases
    const totalPurchases = await db
      .select({ total: sql<number>`COALESCE(SUM(${bill.total}), 0)`.mapWith(Number) })
      .from(bill)
      .where(and(
        eq(bill.organizationId, ctx.organizationId),
        gte(bill.issueDate, startDate),
        lte(bill.issueDate, endDate),
        notInArray(bill.status, ["draft", "void"]),
        isNull(bill.deletedAt)
      ));

    // 1B: GST on purchases
    const gstOnPurchases = await db
      .select({ total: sql<number>`COALESCE(SUM(${billLine.taxAmount}), 0)`.mapWith(Number) })
      .from(billLine)
      .innerJoin(bill, eq(billLine.billId, bill.id))
      .where(and(
        eq(bill.organizationId, ctx.organizationId),
        gte(bill.issueDate, startDate),
        lte(bill.issueDate, endDate),
        notInArray(bill.status, ["draft", "void"]),
        isNull(bill.deletedAt)
      ));

    const g1 = totalSales[0]?.total || 0;
    const oneA = gstOnSales[0]?.total || 0;
    const g11 = totalPurchases[0]?.total || 0;
    const oneB = gstOnPurchases[0]?.total || 0;

    const fields = [
      { field: "G1", label: "Total sales (including GST)", amount: g1 },
      { field: "G2", label: "Export sales", amount: 0 },
      { field: "G3", label: "Other GST-free sales", amount: 0 },
      { field: "G10", label: "Capital purchases", amount: 0 },
      { field: "G11", label: "Non-capital purchases", amount: g11 },
      { field: "1A", label: "GST on sales", amount: oneA },
      { field: "1B", label: "GST on purchases", amount: oneB },
      { field: "NET", label: "Net GST (1A - 1B)", amount: oneA - oneB },
    ];

    return NextResponse.json({ fields, period: { startDate, endDate } });
  } catch (err) {
    return handleError(err);
  }
}

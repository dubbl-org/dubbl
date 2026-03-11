import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, invoiceLine, bill, billLine, taxRate } from "@/lib/db/schema";
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

    // Box 1: Output VAT on sales (tax from invoices)
    const salesTax = await db
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

    // Box 4: Input VAT on purchases (tax from bills)
    const purchaseTax = await db
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

    // Box 6: Total sales ex-VAT
    const totalSales = await db
      .select({ total: sql<number>`COALESCE(SUM(${invoice.subtotal}), 0)`.mapWith(Number) })
      .from(invoice)
      .where(and(
        eq(invoice.organizationId, ctx.organizationId),
        gte(invoice.issueDate, startDate),
        lte(invoice.issueDate, endDate),
        notInArray(invoice.status, ["draft", "void"]),
        isNull(invoice.deletedAt)
      ));

    // Box 7: Total purchases ex-VAT
    const totalPurchases = await db
      .select({ total: sql<number>`COALESCE(SUM(${bill.subtotal}), 0)`.mapWith(Number) })
      .from(bill)
      .where(and(
        eq(bill.organizationId, ctx.organizationId),
        gte(bill.issueDate, startDate),
        lte(bill.issueDate, endDate),
        notInArray(bill.status, ["draft", "void"]),
        isNull(bill.deletedAt)
      ));

    const box1 = salesTax[0]?.total || 0;
    const box2 = 0; // EU acquisitions - would need tagging
    const box3 = box1 + box2;
    const box4 = purchaseTax[0]?.total || 0;
    const box5 = box3 - box4;
    const box6 = totalSales[0]?.total || 0;
    const box7 = totalPurchases[0]?.total || 0;
    const box8 = 0; // Supplies to EU
    const box9 = 0; // Acquisitions from EU

    const boxes = [
      { box: "1", label: "VAT due on sales", amount: box1 },
      { box: "2", label: "VAT due on EU acquisitions", amount: box2 },
      { box: "3", label: "Total VAT due (Box 1 + 2)", amount: box3 },
      { box: "4", label: "VAT reclaimed on purchases", amount: box4 },
      { box: "5", label: "Net VAT to pay/reclaim (Box 3 - 4)", amount: box5 },
      { box: "6", label: "Total sales ex-VAT", amount: box6 },
      { box: "7", label: "Total purchases ex-VAT", amount: box7 },
      { box: "8", label: "Total supplies to EU ex-VAT", amount: box8 },
      { box: "9", label: "Total acquisitions from EU ex-VAT", amount: box9 },
    ];

    return NextResponse.json({ boxes, period: { startDate, endDate } });
  } catch (err) {
    return handleError(err);
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  invoiceLine,
  invoice,
  billLine,
  bill,
  taxRate,
  taxComponent,
} from "@/lib/db/schema";
import { eq, and, gte, lte, sql, isNull, notInArray } from "drizzle-orm";
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

    // Get all tax rates for the org
    const rates = await db.query.taxRate.findMany({
      where: and(
        eq(taxRate.organizationId, ctx.organizationId),
        isNull(taxRate.deletedAt)
      ),
      with: { components: true },
    });

    // Output tax (sales): from invoice lines
    const outputRows = await db
      .select({
        taxRateId: invoiceLine.taxRateId,
        totalTax: sql<number>`COALESCE(SUM(${invoiceLine.taxAmount}), 0)`,
        totalNet: sql<number>`COALESCE(SUM(${invoiceLine.quantity} * ${invoiceLine.unitPrice} / 100), 0)`,
        lineCount: sql<number>`COUNT(*)`,
      })
      .from(invoiceLine)
      .innerJoin(invoice, eq(invoiceLine.invoiceId, invoice.id))
      .where(
        and(
          eq(invoice.organizationId, ctx.organizationId),
          notInArray(invoice.status, ["draft", "void"]),
          gte(invoice.issueDate, startDate),
          lte(invoice.issueDate, endDate),
          sql`${invoiceLine.taxRateId} IS NOT NULL`
        )
      )
      .groupBy(invoiceLine.taxRateId);

    // Input tax (purchases): from bill lines
    const inputRows = await db
      .select({
        taxRateId: billLine.taxRateId,
        totalTax: sql<number>`COALESCE(SUM(${billLine.taxAmount}), 0)`,
        totalNet: sql<number>`COALESCE(SUM(${billLine.quantity} * ${billLine.unitPrice} / 100), 0)`,
        lineCount: sql<number>`COUNT(*)`,
      })
      .from(billLine)
      .innerJoin(bill, eq(billLine.billId, bill.id))
      .where(
        and(
          eq(bill.organizationId, ctx.organizationId),
          notInArray(bill.status, ["draft", "void"]),
          gte(bill.issueDate, startDate),
          lte(bill.issueDate, endDate),
          sql`${billLine.taxRateId} IS NOT NULL`
        )
      )
      .groupBy(billLine.taxRateId);

    // Build summary per tax rate
    const summary = rates.map((rate) => {
      const output = outputRows.find((r) => r.taxRateId === rate.id);
      const input = inputRows.find((r) => r.taxRateId === rate.id);

      const outputTax = Number(output?.totalTax || 0);
      const inputTax = Number(input?.totalTax || 0);
      const outputNet = Number(output?.totalNet || 0);
      const inputNet = Number(input?.totalNet || 0);

      return {
        taxRateId: rate.id,
        taxRateName: rate.name,
        rate: rate.rate,
        type: rate.type,
        outputTax,
        outputNet,
        outputTransactions: Number(output?.lineCount || 0),
        inputTax,
        inputNet,
        inputTransactions: Number(input?.lineCount || 0),
        netTax: outputTax - inputTax,
      };
    });

    // Filter out rates with no activity
    const activeSummary = summary.filter(
      (s) => s.outputTax > 0 || s.inputTax > 0
    );

    const totalOutputTax = activeSummary.reduce((s, r) => s + r.outputTax, 0);
    const totalInputTax = activeSummary.reduce((s, r) => s + r.inputTax, 0);
    const netTaxPayable = totalOutputTax - totalInputTax;

    return NextResponse.json({
      startDate,
      endDate,
      rates: activeSummary,
      totalOutputTax,
      totalInputTax,
      netTaxPayable,
    });
  } catch (err) {
    return handleError(err);
  }
}

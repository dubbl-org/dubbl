import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  invoiceLine,
  invoice,
  billLine,
  bill,
  taxRate,
} from "@/lib/db/schema";
import { eq, and, gte, lte, sql, isNull, notInArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { requireRole } from "@/lib/api/require-role";
import { splitCompoundTax } from "@/lib/tax/compound";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");
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
        totalNet: sql<number>`COALESCE(SUM(${invoiceLine.amount}), 0)`,
        lineCount: sql<number>`COUNT(*)`,
      })
      .from(invoiceLine)
      .innerJoin(invoice, eq(invoiceLine.invoiceId, invoice.id))
      .where(
        and(
          eq(invoice.organizationId, ctx.organizationId),
          notInArray(invoice.status, ["draft", "void", "pending_approval", "rejected"]),
          isNull(invoice.deletedAt),
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
        totalNet: sql<number>`COALESCE(SUM(${billLine.amount}), 0)`,
        lineCount: sql<number>`COUNT(*)`,
      })
      .from(billLine)
      .innerJoin(bill, eq(billLine.billId, bill.id))
      .where(
        and(
          eq(bill.organizationId, ctx.organizationId),
          notInArray(bill.status, ["draft", "void", "pending_approval"]),
          isNull(bill.deletedAt),
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
        // Compound rates: the tax shared between the parts by part rate, the
        // same split used when documents post.
        parts: (rate.components ?? []).length
          ? (() => {
              const parts = rate.components.map((c) => ({ rate: c.rate, accountId: c.accountId }));
              const out = splitCompoundTax(outputTax, parts);
              const inp = splitCompoundTax(inputTax, parts);
              return rate.components.map((c, i) => ({
                name: c.name,
                rate: c.rate,
                accountId: c.accountId,
                outputTax: out[i]?.amount ?? 0,
                inputTax: inp[i]?.amount ?? 0,
              }));
            })()
          : [],
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

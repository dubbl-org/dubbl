import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, bill, organization } from "@/lib/db/schema";
import { eq, and, isNull, ne } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { getExchangeRate, calculateFxGainLoss } from "@/lib/currency/converter";

interface UnrealizedItem {
  type: "invoice" | "bill";
  id: string;
  number: string;
  currencyCode: string;
  amountDue: number;
  issueDate: string;
  originalRate: number | null;
  currentRate: number | null;
  originalAmountBase: number | null;
  currentAmountBase: number | null;
  unrealizedGainLoss: number | null;
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    // Get org default currency
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const defaultCurrency = org.defaultCurrency;
    const today = new Date().toISOString().split("T")[0];

    // Get unpaid invoices with foreign currency
    const unpaidInvoices = await db.query.invoice.findMany({
      where: and(
        eq(invoice.organizationId, ctx.organizationId),
        isNull(invoice.deletedAt),
        ne(invoice.status, "void"),
        ne(invoice.status, "paid"),
        ne(invoice.status, "draft"),
        ne(invoice.currencyCode, defaultCurrency)
      ),
    });

    // Get unpaid bills with foreign currency
    const unpaidBills = await db.query.bill.findMany({
      where: and(
        eq(bill.organizationId, ctx.organizationId),
        isNull(bill.deletedAt),
        ne(bill.status, "void"),
        ne(bill.status, "paid"),
        ne(bill.status, "draft"),
        ne(bill.currencyCode, defaultCurrency)
      ),
    });

    const items: UnrealizedItem[] = [];
    let totalGain = 0;
    let totalLoss = 0;

    // Process invoices
    for (const inv of unpaidInvoices) {
      const originalRate = await getExchangeRate(
        ctx.organizationId,
        inv.currencyCode,
        defaultCurrency,
        inv.issueDate
      );
      const currentRate = await getExchangeRate(
        ctx.organizationId,
        inv.currencyCode,
        defaultCurrency,
        today
      );

      let unrealizedGainLoss: number | null = null;
      let originalAmountBase: number | null = null;
      let currentAmountBase: number | null = null;

      if (originalRate && currentRate) {
        unrealizedGainLoss = calculateFxGainLoss(inv.amountDue, originalRate, currentRate);
        originalAmountBase = Math.round((inv.amountDue * originalRate) / 1000000);
        currentAmountBase = Math.round((inv.amountDue * currentRate) / 1000000);

        if (unrealizedGainLoss > 0) totalGain += unrealizedGainLoss;
        else totalLoss += unrealizedGainLoss;
      }

      items.push({
        type: "invoice",
        id: inv.id,
        number: inv.invoiceNumber,
        currencyCode: inv.currencyCode,
        amountDue: inv.amountDue,
        issueDate: inv.issueDate,
        originalRate,
        currentRate,
        originalAmountBase,
        currentAmountBase,
        unrealizedGainLoss,
      });
    }

    // Process bills
    for (const b of unpaidBills) {
      const originalRate = await getExchangeRate(
        ctx.organizationId,
        b.currencyCode,
        defaultCurrency,
        b.issueDate
      );
      const currentRate = await getExchangeRate(
        ctx.organizationId,
        b.currencyCode,
        defaultCurrency,
        today
      );

      let unrealizedGainLoss: number | null = null;
      let originalAmountBase: number | null = null;
      let currentAmountBase: number | null = null;

      if (originalRate && currentRate) {
        // For bills (liabilities), FX gain/loss is inverted
        // If foreign currency strengthens, it's a loss for payables
        unrealizedGainLoss = -calculateFxGainLoss(b.amountDue, originalRate, currentRate);
        originalAmountBase = Math.round((b.amountDue * originalRate) / 1000000);
        currentAmountBase = Math.round((b.amountDue * currentRate) / 1000000);

        if (unrealizedGainLoss > 0) totalGain += unrealizedGainLoss;
        else totalLoss += unrealizedGainLoss;
      }

      items.push({
        type: "bill",
        id: b.id,
        number: b.billNumber,
        currencyCode: b.currencyCode,
        amountDue: b.amountDue,
        issueDate: b.issueDate,
        originalRate,
        currentRate,
        originalAmountBase,
        currentAmountBase,
        unrealizedGainLoss,
      });
    }

    return NextResponse.json({
      defaultCurrency,
      items,
      summary: {
        totalItems: items.length,
        totalUnrealizedGain: totalGain,
        totalUnrealizedLoss: totalLoss,
        netUnrealizedGainLoss: totalGain + totalLoss,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

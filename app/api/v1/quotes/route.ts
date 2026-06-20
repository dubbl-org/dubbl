import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { quote, quoteLine, inventoryItem } from "@/lib/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToMinorUnits } from "@/lib/money";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { resolvePrice } from "@/lib/api/pricing";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  // Decimal unit price (e.g. 12.50). When omitted for an inventory-item line,
  // the price is resolved from the line/document price list (falling back to the
  // item's default sale price). An explicit value here always wins.
  unitPrice: z.number().optional(),
  accountId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
  discountPercent: z.number().int().min(0).max(10000).default(0),
  // Inventory item this line prices (used only for default-price resolution;
  // the quote_line table does not persist it).
  inventoryItemId: z.string().nullable().optional(),
  // Per-line price list override; falls back to the document-level priceListId.
  priceListId: z.string().nullable().optional(),
});

const createSchema = z.object({
  contactId: z.string().min(1),
  issueDate: z.string().min(1),
  expiryDate: z.string().min(1),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  currencyCode: currencyCodeSchema.default("USD"),
  // Default price list applied to inventory-item lines that don't carry their own.
  priceListId: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");

    const conditions = [
      eq(quote.organizationId, ctx.organizationId),
      notDeleted(quote.deletedAt),
    ];

    if (status) {
      conditions.push(eq(quote.status, status as typeof quote.status.enumValues[number]));
    }

    const quotes = await db.query.quote.findMany({
      where: and(...conditions),
      orderBy: desc(quote.createdAt),
      limit,
      offset,
      with: { contact: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(quote)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(quotes, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:invoices");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const quoteNumber = await getNextNumber(ctx.organizationId, "quote", "quote_number", "QTE");

    // Preload tax rates
    const taxRateIds = parsed.lines.map((l) => l.taxRateId).filter(Boolean) as string[];
    const ratesMap = await preloadTaxRates(taxRateIds);

    // Resolve default unit prices (integer cents) for inventory-item lines that
    // don't carry an explicit unitPrice: prefer the line/document price list,
    // then fall back to the item's default sale price. Lines with an explicit
    // unitPrice are unaffected. Item default prices are preloaded in one query.
    const itemIds = [
      ...new Set(
        parsed.lines
          .filter((l) => l.inventoryItemId && l.unitPrice === undefined)
          .map((l) => l.inventoryItemId as string)
      ),
    ];
    const itemPriceMap = new Map<string, number>();
    if (itemIds.length > 0) {
      const items = await db.query.inventoryItem.findMany({
        where: and(
          eq(inventoryItem.organizationId, ctx.organizationId),
          inArray(inventoryItem.id, itemIds)
        ),
        columns: { id: true, salePrice: true },
      });
      for (const it of items) itemPriceMap.set(it.id, it.salePrice);
    }

    // unitPriceCents per line, in the same order as parsed.lines.
    const unitPricesCents = await Promise.all(
      parsed.lines.map(async (l) => {
        // Explicit price always wins (caller override).
        if (l.unitPrice !== undefined) return decimalToMinorUnits(l.unitPrice, parsed.currencyCode);
        if (l.inventoryItemId) {
          const listId = l.priceListId || parsed.priceListId || null;
          if (listId) {
            const resolved = await resolvePrice(
              ctx.organizationId,
              l.inventoryItemId,
              listId,
              l.quantity || 1,
              parsed.issueDate
            );
            if (resolved) return resolved.unitPrice;
          }
          // Fall back to the item's default sale price.
          return itemPriceMap.get(l.inventoryItemId) ?? 0;
        }
        return 0;
      })
    );

    // Calculate totals
    let subtotal = 0;
    const processedLines = parsed.lines.map((l, i) => {
      const unitPriceCents = unitPricesCents[i];
      const grossAmount = Math.round(l.quantity * unitPriceCents);
      const discountAmount = l.discountPercent ? Math.round(grossAmount * l.discountPercent / 10000) : 0;
      const amount = grossAmount - discountAmount;
      subtotal += amount;
      const taxRateId = l.taxRateId || null;
      const taxAmount = taxRateId ? calcTax(amount, ratesMap.get(taxRateId) ?? 0) : 0;
      return {
        description: l.description,
        quantity: Math.round(l.quantity * 100),
        unitPrice: unitPriceCents,
        accountId: l.accountId || null,
        taxRateId,
        discountPercent: l.discountPercent,
        taxAmount,
        amount,
        sortOrder: i,
      };
    });

    const taxTotal = processedLines.reduce((sum, l) => sum + l.taxAmount, 0);
    const total = subtotal + taxTotal;

    const [created] = await db
      .insert(quote)
      .values({
        organizationId: ctx.organizationId,
        contactId: parsed.contactId,
        quoteNumber,
        issueDate: parsed.issueDate,
        expiryDate: parsed.expiryDate,
        reference: parsed.reference || null,
        notes: parsed.notes || null,
        subtotal,
        taxTotal,
        total,
        currencyCode: parsed.currencyCode,
        createdBy: ctx.userId,
      })
      .returning();

    await db.insert(quoteLine).values(
      processedLines.map((l) => ({
        quoteId: created.id,
        ...l,
      }))
    );

    logAudit({ ctx, action: "create", entityType: "quote", entityId: created.id, request });

    return NextResponse.json({ quote: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

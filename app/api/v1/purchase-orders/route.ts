import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { purchaseOrder, purchaseOrderLine } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToCents } from "@/lib/money";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { z } from "zod";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  accountId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
  discountPercent: z.number().int().min(0).max(10000).default(0),
});

const createSchema = z.object({
  contactId: z.string().min(1),
  issueDate: z.string().min(1),
  deliveryDate: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  currencyCode: z.string().default("USD"),
  lines: z.array(lineSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");

    const conditions = [
      eq(purchaseOrder.organizationId, ctx.organizationId),
      notDeleted(purchaseOrder.deletedAt),
    ];

    if (status) {
      conditions.push(eq(purchaseOrder.status, status as typeof purchaseOrder.status.enumValues[number]));
    }

    const purchaseOrders = await db.query.purchaseOrder.findMany({
      where: and(...conditions),
      orderBy: desc(purchaseOrder.createdAt),
      limit,
      offset,
      with: { contact: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(purchaseOrder)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(purchaseOrders, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bills");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const poNumber = await getNextNumber(ctx.organizationId, "purchase_order", "po_number", "PO");

    // Preload tax rates
    const taxRateIds = parsed.lines.map((l) => l.taxRateId).filter(Boolean) as string[];
    const ratesMap = await preloadTaxRates(taxRateIds);

    // Calculate totals
    let subtotal = 0;
    const processedLines = parsed.lines.map((l, i) => {
      const grossAmount = decimalToCents(l.quantity * l.unitPrice);
      const discountAmount = l.discountPercent ? Math.round(grossAmount * l.discountPercent / 10000) : 0;
      const amount = grossAmount - discountAmount;
      subtotal += amount;
      const taxRateId = l.taxRateId || null;
      const taxAmount = taxRateId ? calcTax(amount, ratesMap.get(taxRateId) ?? 0) : 0;
      return {
        description: l.description,
        quantity: Math.round(l.quantity * 100),
        unitPrice: decimalToCents(l.unitPrice),
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
      .insert(purchaseOrder)
      .values({
        organizationId: ctx.organizationId,
        contactId: parsed.contactId,
        poNumber,
        issueDate: parsed.issueDate,
        deliveryDate: parsed.deliveryDate || null,
        reference: parsed.reference || null,
        notes: parsed.notes || null,
        subtotal,
        taxTotal,
        total,
        currencyCode: parsed.currencyCode,
        createdBy: ctx.userId,
      })
      .returning();

    await db.insert(purchaseOrderLine).values(
      processedLines.map((l) => ({
        purchaseOrderId: created.id,
        ...l,
      }))
    );

    return NextResponse.json({ purchaseOrder: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesReceipt, salesReceiptLine } from "@/lib/db/schema";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToMinorUnits } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
import { logAudit } from "@/lib/api/audit";
import { checkMultiCurrency } from "@/lib/api/check-limit";
import { preloadTaxRates, calcTax } from "@/lib/api/tax-calculator";
import { resolveDocumentCurrency } from "@/lib/currency/resolve-currency";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { z } from "zod";

// One sale line. quantity/unitPrice are human-decimal (1.5 units, $12.50);
// converted to integer scale on write. discountPercent is basis points (1000 = 10%).
const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  accountId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
  discountPercent: z.number().int().min(0).max(10000).default(0),
  costCenterId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  // When set, this line relieves inventory and posts COGS for the item on `post`.
  inventoryItemId: z.string().nullable().optional(),
  warehouseId: z.string().nullable().optional(),
});

const createSchema = z.object({
  contactId: z.string().min(1),
  date: z.string().min(1),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  currencyCode: currencyCodeSchema.optional(),
  // Where the cash lands when posted: a bank account (preferred) or a deposit
  // chart account. Optional at draft time; required to post.
  bankAccountId: z.string().nullable().optional(),
  depositAccountId: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SORT_COLUMNS: Record<string, any> = {
  date: salesReceipt.date,
  total: salesReceipt.total,
  number: salesReceipt.receiptNumber,
  created: salesReceipt.createdAt,
};

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");
    const contactId = url.searchParams.get("contactId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const sortBy = url.searchParams.get("sortBy") || "created";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";

    const conditions = [
      eq(salesReceipt.organizationId, ctx.organizationId),
      notDeleted(salesReceipt.deletedAt),
    ];

    if (status) {
      conditions.push(
        eq(salesReceipt.status, status as (typeof salesReceipt.status.enumValues)[number])
      );
    }
    if (contactId) {
      conditions.push(eq(salesReceipt.contactId, contactId));
    }
    if (from) {
      conditions.push(gte(salesReceipt.date, from));
    }
    if (to) {
      conditions.push(lte(salesReceipt.date, to));
    }

    const sortCol = SORT_COLUMNS[sortBy] || salesReceipt.createdAt;
    const orderFn = sortOrder === "asc" ? asc : desc;

    const receipts = await db.query.salesReceipt.findMany({
      where: and(...conditions),
      orderBy: orderFn(sortCol),
      limit,
      offset,
      with: { contact: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(salesReceipt)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(receipts, Number(countResult?.count || 0), page, limit)
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

    await assertNotLocked(ctx.organizationId, parsed.date);

    // Resolve currency: explicit request > contact default > org default > USD.
    const currencyCode = await resolveDocumentCurrency(
      ctx.organizationId,
      parsed.currencyCode,
      parsed.contactId
    );
    await checkMultiCurrency(ctx.organizationId, currencyCode);

    const receiptNumber = await getNextNumber(
      ctx.organizationId,
      "sales_receipt",
      "receipt_number",
      "SR"
    );

    // Preload tax rates (basis points). Lines are tax-EXCLUSIVE: `amount` is net,
    // `taxAmount` is computed on top — mirroring invoice line handling.
    const taxRateIds = parsed.lines.map((l) => l.taxRateId).filter(Boolean) as string[];
    const ratesMap = await preloadTaxRates(taxRateIds);

    let subtotal = 0;
    const processedLines = parsed.lines.map((l, i) => {
      const grossAmount = decimalToMinorUnits(l.quantity * l.unitPrice, currencyCode);
      const discountAmount = l.discountPercent
        ? Math.round((grossAmount * l.discountPercent) / 10000)
        : 0;
      const amount = grossAmount - discountAmount;
      subtotal += amount;
      const taxRateId = l.taxRateId || null;
      const taxAmount = taxRateId ? calcTax(amount, ratesMap.get(taxRateId) ?? 0) : 0;
      return {
        description: l.description,
        quantity: Math.round(l.quantity * 100),
        unitPrice: decimalToMinorUnits(l.unitPrice, currencyCode),
        accountId: l.accountId || null,
        taxRateId,
        discountPercent: l.discountPercent,
        taxAmount,
        amount,
        costCenterId: l.costCenterId || null,
        projectId: l.projectId || null,
        inventoryItemId: l.inventoryItemId || null,
        warehouseId: l.warehouseId || null,
        sortOrder: i,
      };
    });

    const taxTotal = processedLines.reduce((sum, l) => sum + l.taxAmount, 0);
    const total = subtotal + taxTotal;

    const [created] = await db
      .insert(salesReceipt)
      .values({
        organizationId: ctx.organizationId,
        contactId: parsed.contactId,
        receiptNumber,
        date: parsed.date,
        reference: parsed.reference || null,
        notes: parsed.notes || null,
        subtotal,
        taxTotal,
        total,
        currencyCode,
        bankAccountId: parsed.bankAccountId || null,
        depositAccountId: parsed.depositAccountId || null,
        createdBy: ctx.userId,
      })
      .returning();

    await db.insert(salesReceiptLine).values(
      processedLines.map((l) => ({
        salesReceiptId: created.id,
        ...l,
      }))
    );

    logAudit({
      ctx,
      action: "create",
      entityType: "sales_receipt",
      entityId: created.id,
      request,
    });

    return NextResponse.json({ salesReceipt: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

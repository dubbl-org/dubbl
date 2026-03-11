import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { quote, quoteLine } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToCents } from "@/lib/money";
import { z } from "zod";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  accountId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
});

const createSchema = z.object({
  contactId: z.string().min(1),
  issueDate: z.string().min(1),
  expiryDate: z.string().min(1),
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

    // Calculate totals
    let subtotal = 0;
    const processedLines = parsed.lines.map((l, i) => {
      const amount = decimalToCents(l.quantity * l.unitPrice);
      subtotal += amount;
      return {
        description: l.description,
        quantity: Math.round(l.quantity * 100),
        unitPrice: decimalToCents(l.unitPrice),
        accountId: l.accountId || null,
        taxRateId: l.taxRateId || null,
        taxAmount: 0,
        amount,
        sortOrder: i,
      };
    });

    const total = subtotal;

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
        taxTotal: 0,
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

    return NextResponse.json({ quote: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

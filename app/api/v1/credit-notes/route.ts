import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creditNote, creditNoteLine } from "@/lib/db/schema";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToCents } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
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
  invoiceId: z.string().nullable().optional(),
  issueDate: z.string().min(1),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  currencyCode: z.string().default("USD"),
  lines: z.array(lineSchema).min(1),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SORT_COLUMNS: Record<string, any> = {
  date: creditNote.issueDate,
  total: creditNote.total,
  remaining: creditNote.amountRemaining,
  number: creditNote.creditNoteNumber,
  created: creditNote.createdAt,
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
      eq(creditNote.organizationId, ctx.organizationId),
      notDeleted(creditNote.deletedAt),
    ];

    if (status) {
      conditions.push(eq(creditNote.status, status as typeof creditNote.status.enumValues[number]));
    }

    if (contactId) {
      conditions.push(eq(creditNote.contactId, contactId));
    }

    if (from) {
      conditions.push(gte(creditNote.issueDate, from));
    }
    if (to) {
      conditions.push(lte(creditNote.issueDate, to));
    }

    const sortCol = SORT_COLUMNS[sortBy] || creditNote.createdAt;
    const orderFn = sortOrder === "asc" ? asc : desc;

    const creditNotes = await db.query.creditNote.findMany({
      where: and(...conditions),
      orderBy: orderFn(sortCol),
      limit,
      offset,
      with: { contact: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(creditNote)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(creditNotes, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:credit-notes");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await assertNotLocked(ctx.organizationId, parsed.issueDate);

    const creditNoteNumber = await getNextNumber(ctx.organizationId, "credit_note", "credit_note_number", "CN");

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
      .insert(creditNote)
      .values({
        organizationId: ctx.organizationId,
        contactId: parsed.contactId,
        invoiceId: parsed.invoiceId || null,
        creditNoteNumber,
        issueDate: parsed.issueDate,
        reference: parsed.reference || null,
        notes: parsed.notes || null,
        subtotal,
        taxTotal,
        total,
        amountApplied: 0,
        amountRemaining: 0,
        currencyCode: parsed.currencyCode,
        createdBy: ctx.userId,
      })
      .returning();

    await db.insert(creditNoteLine).values(
      processedLines.map((l) => ({
        creditNoteId: created.id,
        ...l,
      }))
    );

    return NextResponse.json({ creditNote: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

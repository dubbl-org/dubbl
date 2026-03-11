import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bill, billLine } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { getNextNumber } from "@/lib/api/numbering";
import { decimalToCents } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
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
  dueDate: z.string().min(1),
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
      eq(bill.organizationId, ctx.organizationId),
      notDeleted(bill.deletedAt),
    ];

    if (status) {
      conditions.push(eq(bill.status, status as typeof bill.status.enumValues[number]));
    }

    const bills = await db.query.bill.findMany({
      where: and(...conditions),
      orderBy: desc(bill.createdAt),
      limit,
      offset,
      with: { contact: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(bill)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(bills, Number(countResult?.count || 0), page, limit)
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

    await assertNotLocked(ctx.organizationId, parsed.issueDate);

    const billNumber = await getNextNumber(ctx.organizationId, "bill", "bill_number", "BILL");

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
      .insert(bill)
      .values({
        organizationId: ctx.organizationId,
        contactId: parsed.contactId,
        billNumber,
        issueDate: parsed.issueDate,
        dueDate: parsed.dueDate,
        reference: parsed.reference || null,
        notes: parsed.notes || null,
        subtotal,
        taxTotal: 0,
        total,
        amountPaid: 0,
        amountDue: total,
        currencyCode: parsed.currencyCode,
        createdBy: ctx.userId,
      })
      .returning();

    await db.insert(billLine).values(
      processedLines.map((l) => ({
        billId: created.id,
        ...l,
      }))
    );

    return NextResponse.json({ bill: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

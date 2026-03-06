import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { debitNote, debitNoteLine } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
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
  billId: z.string().nullable().optional(),
  issueDate: z.string().min(1),
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
    const contactId = url.searchParams.get("contactId");

    const conditions = [
      eq(debitNote.organizationId, ctx.organizationId),
      notDeleted(debitNote.deletedAt),
    ];

    if (status) {
      conditions.push(eq(debitNote.status, status as typeof debitNote.status.enumValues[number]));
    }

    if (contactId) {
      conditions.push(eq(debitNote.contactId, contactId));
    }

    const debitNotes = await db.query.debitNote.findMany({
      where: and(...conditions),
      orderBy: desc(debitNote.createdAt),
      limit,
      offset,
      with: { contact: true },
    });

    const [countResult] = await db
      .select({ count: db.$count(debitNote) })
      .from(debitNote)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(debitNotes, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:debit-notes");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const debitNoteNumber = await getNextNumber(ctx.organizationId, "debit_note", "debit_note_number", "DN");

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
      .insert(debitNote)
      .values({
        organizationId: ctx.organizationId,
        contactId: parsed.contactId,
        billId: parsed.billId || null,
        debitNoteNumber,
        issueDate: parsed.issueDate,
        reference: parsed.reference || null,
        notes: parsed.notes || null,
        subtotal,
        taxTotal: 0,
        total,
        amountApplied: 0,
        amountRemaining: 0,
        currencyCode: parsed.currencyCode,
        createdBy: ctx.userId,
      })
      .returning();

    await db.insert(debitNoteLine).values(
      processedLines.map((l) => ({
        debitNoteId: created.id,
        ...l,
      }))
    );

    return NextResponse.json({ debitNote: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

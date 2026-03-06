import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payment, paymentAllocation, invoice, bill } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { assertNotLocked } from "@/lib/api/period-lock";
import { createPaymentJournalEntry } from "@/lib/api/journal-automation";
import { z } from "zod";

const allocationSchema = z.object({
  documentType: z.enum(["invoice", "bill"]),
  documentId: z.string().min(1),
  amount: z.number().int().positive(),
});

const createSchema = z.object({
  contactId: z.string().min(1),
  type: z.enum(["received", "made"]),
  date: z.string().min(1),
  amount: z.number().int().positive(),
  method: z.enum(["bank_transfer", "cash", "check", "card", "other"]).default("bank_transfer"),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  bankAccountId: z.string().nullable().optional(),
  allocations: z.array(allocationSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const type = url.searchParams.get("type");
    const contactId = url.searchParams.get("contactId");

    const conditions = [
      eq(payment.organizationId, ctx.organizationId),
      notDeleted(payment.deletedAt),
    ];

    if (type) {
      conditions.push(eq(payment.type, type as "received" | "made"));
    }

    if (contactId) {
      conditions.push(eq(payment.contactId, contactId));
    }

    const payments = await db.query.payment.findMany({
      where: and(...conditions),
      orderBy: desc(payment.createdAt),
      limit,
      offset,
      with: { contact: true, allocations: true },
    });

    const [countResult] = await db
      .select({ count: db.$count(payment) })
      .from(payment)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(payments, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payments");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    await assertNotLocked(ctx.organizationId, parsed.date);

    // Validate allocations total does not exceed payment amount
    const allocationsTotal = parsed.allocations.reduce((sum, a) => sum + a.amount, 0);
    if (allocationsTotal > parsed.amount) {
      return NextResponse.json(
        { error: "Allocations total exceeds payment amount" },
        { status: 400 }
      );
    }

    // Generate payment number (PAY-00001 pattern)
    const [maxResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(payment)
      .where(eq(payment.organizationId, ctx.organizationId));
    const next = (Number(maxResult?.count) || 0) + 1;
    const paymentNumber = `PAY-${next.toString().padStart(5, "0")}`;

    // Create payment record
    const [created] = await db
      .insert(payment)
      .values({
        organizationId: ctx.organizationId,
        contactId: parsed.contactId,
        paymentNumber,
        type: parsed.type,
        date: parsed.date,
        amount: parsed.amount,
        method: parsed.method,
        reference: parsed.reference || null,
        notes: parsed.notes || null,
        bankAccountId: parsed.bankAccountId || null,
        createdBy: ctx.userId,
      })
      .returning();

    // Insert allocation rows
    await db.insert(paymentAllocation).values(
      parsed.allocations.map((a) => ({
        paymentId: created.id,
        documentType: a.documentType,
        documentId: a.documentId,
        amount: a.amount,
      }))
    );

    // Update allocated documents
    for (const alloc of parsed.allocations) {
      if (alloc.documentType === "invoice") {
        const existing = await db.query.invoice.findFirst({
          where: and(
            eq(invoice.id, alloc.documentId),
            eq(invoice.organizationId, ctx.organizationId)
          ),
        });
        if (existing) {
          const newAmountPaid = existing.amountPaid + alloc.amount;
          const newAmountDue = existing.amountDue - alloc.amount;
          const newStatus = newAmountDue <= 0 ? "paid" : "partial";
          await db
            .update(invoice)
            .set({
              amountPaid: newAmountPaid,
              amountDue: Math.max(0, newAmountDue),
              status: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(invoice.id, alloc.documentId));
        }
      } else if (alloc.documentType === "bill") {
        const existing = await db.query.bill.findFirst({
          where: and(
            eq(bill.id, alloc.documentId),
            eq(bill.organizationId, ctx.organizationId)
          ),
        });
        if (existing) {
          const newAmountPaid = existing.amountPaid + alloc.amount;
          const newAmountDue = existing.amountDue - alloc.amount;
          const newStatus = newAmountDue <= 0 ? "paid" : "partial";
          await db
            .update(bill)
            .set({
              amountPaid: newAmountPaid,
              amountDue: Math.max(0, newAmountDue),
              status: newStatus,
              updatedAt: new Date(),
            })
            .where(eq(bill.id, alloc.documentId));
        }
      }
    }

    // Create journal entry
    const journalEntry = await createPaymentJournalEntry(
      { organizationId: ctx.organizationId, userId: ctx.userId },
      {
        type: parsed.type === "received" ? "invoice" : "bill",
        reference: paymentNumber,
        amount: parsed.amount,
        date: parsed.date,
      }
    );

    // Link journal entry to payment
    if (journalEntry) {
      await db
        .update(payment)
        .set({ journalEntryId: journalEntry.id, updatedAt: new Date() })
        .where(eq(payment.id, created.id));
    }

    const result = await db.query.payment.findFirst({
      where: eq(payment.id, created.id),
      with: { contact: true, allocations: true },
    });

    return NextResponse.json({ payment: result }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

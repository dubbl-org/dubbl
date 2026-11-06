import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduledPayment, bill } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { checkPaymentBankAccount } from "@/lib/api/payment-bank-account";

const createSchema = z.object({
  billId: z.string().min(1),
  contactId: z.string().min(1),
  amount: z.number().int().positive(),
  currencyCode: currencyCodeSchema.default("USD"),
  scheduledDate: z.string().min(1),
  notes: z.string().nullable().optional(),
  // The bank account (bank_account row) the payment will be made from.
  // Omitted = the default bank ledger account (1100).
  bankAccountId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");

    const conditions = [
      eq(scheduledPayment.organizationId, ctx.organizationId),
      notDeleted(scheduledPayment.deletedAt),
    ];

    if (status) {
      conditions.push(
        eq(
          scheduledPayment.status,
          status as (typeof scheduledPayment.status.enumValues)[number]
        )
      );
    }

    const items = await db.query.scheduledPayment.findMany({
      where: and(...conditions),
      orderBy: desc(scheduledPayment.scheduledDate),
      limit,
      offset,
      with: {
        bill: { with: { contact: true } },
        contact: true,
        bankAccount: { columns: { id: true, accountName: true, currencyCode: true } },
      },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(scheduledPayment)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(
        items,
        Number(countResult?.count || 0),
        page,
        limit
      )
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

    // Validate the bill exists and belongs to this org
    const existingBill = await db.query.bill.findFirst({
      where: and(
        eq(bill.id, parsed.billId),
        eq(bill.organizationId, ctx.organizationId),
        notDeleted(bill.deletedAt)
      ),
    });

    if (!existingBill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    if (parsed.bankAccountId) {
      const bankError = await checkPaymentBankAccount(ctx.organizationId, parsed.bankAccountId, [existingBill.currencyCode]);
      if (bankError) {
        return NextResponse.json({ error: bankError }, { status: 400 });
      }
    }

    const [created] = await db
      .insert(scheduledPayment)
      .values({
        organizationId: ctx.organizationId,
        billId: parsed.billId,
        contactId: parsed.contactId,
        amount: parsed.amount,
        // The bill decides the currency (the client may omit it, which used
        // to default a EUR bill's payment to USD).
        currencyCode: existingBill.currencyCode,
        scheduledDate: parsed.scheduledDate,
        bankAccountId: parsed.bankAccountId || null,
        notes: parsed.notes || null,
      })
      .returning();

    const result = await db.query.scheduledPayment.findFirst({
      where: eq(scheduledPayment.id, created.id),
      with: {
        bill: { with: { contact: true } },
        contact: true,
        bankAccount: { columns: { id: true, accountName: true, currencyCode: true } },
      },
    });

    logAudit({ ctx, action: "create", entityType: "scheduled_payment", entityId: created.id, request });

    return NextResponse.json({ scheduledPayment: result }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

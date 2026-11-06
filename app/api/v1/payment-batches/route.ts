import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { paymentBatch, paymentBatchItem, bill } from "@/lib/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { checkPaymentBankAccount } from "@/lib/api/payment-bank-account";

const itemSchema = z.object({
  billId: z.string().min(1),
  contactId: z.string().min(1),
  amount: z.number().int().positive(),
  currencyCode: currencyCodeSchema.default("USD"),
});

const createSchema = z.object({
  name: z.string().min(1),
  currencyCode: currencyCodeSchema.default("USD"),
  // The bank account (bank_account row) every payment in the batch is paid
  // from. Omitted = the default bank ledger account (1100).
  bankAccountId: z.string().uuid().nullable().optional(),
  items: z.array(itemSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [
      eq(paymentBatch.organizationId, ctx.organizationId),
      notDeleted(paymentBatch.deletedAt),
    ];

    const batches = await db.query.paymentBatch.findMany({
      where: and(...conditions),
      orderBy: desc(paymentBatch.createdAt),
      limit,
      offset,
      with: { items: true, bankAccount: { columns: { id: true, accountName: true, currencyCode: true } } },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(paymentBatch)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(
        batches,
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

    if (parsed.bankAccountId) {
      // Check the account can pay every bill in the batch (currency) up front,
      // rather than failing each item at submit.
      const bills = await db.query.bill.findMany({
        where: and(
          eq(bill.organizationId, ctx.organizationId),
          inArray(bill.id, parsed.items.map((i) => i.billId))
        ),
        columns: { currencyCode: true },
      });
      const bankError = await checkPaymentBankAccount(
        ctx.organizationId,
        parsed.bankAccountId,
        bills.map((b) => b.currencyCode)
      );
      if (bankError) {
        return NextResponse.json({ error: bankError }, { status: 400 });
      }
    }

    const totalAmount = parsed.items.reduce((sum, item) => sum + item.amount, 0);

    const [created] = await db
      .insert(paymentBatch)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        currencyCode: parsed.currencyCode,
        bankAccountId: parsed.bankAccountId || null,
        totalAmount,
        paymentCount: parsed.items.length,
      })
      .returning();

    await db.insert(paymentBatchItem).values(
      parsed.items.map((item) => ({
        batchId: created.id,
        billId: item.billId,
        contactId: item.contactId,
        amount: item.amount,
        currencyCode: item.currencyCode,
      }))
    );

    const result = await db.query.paymentBatch.findFirst({
      where: eq(paymentBatch.id, created.id),
      with: { items: true },
    });

    return NextResponse.json({ batch: result }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { paymentBatch, paymentBatchItem } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const itemSchema = z.object({
  billId: z.string().min(1),
  contactId: z.string().min(1),
  amount: z.number().int().positive(),
  currencyCode: z.string().default("USD"),
});

const createSchema = z.object({
  name: z.string().min(1),
  currencyCode: z.string().default("USD"),
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
      with: { items: true },
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

    const totalAmount = parsed.items.reduce((sum, item) => sum + item.amount, 0);

    const [created] = await db
      .insert(paymentBatch)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        currencyCode: parsed.currencyCode,
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

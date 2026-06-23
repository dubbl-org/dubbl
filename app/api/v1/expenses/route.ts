import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenseClaim, expenseItem } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { decimalToMinorUnits } from "@/lib/money";
import { assertNotLocked } from "@/lib/api/period-lock";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";
import { resolveDocumentCurrency } from "@/lib/currency/resolve-currency";

const itemSchema = z
  .object({
    date: z.string().min(1),
    description: z.string().min(1),
    amount: z.number().min(0),
    category: z.string().nullable().optional(),
    accountId: z.string().nullable().optional(),
    // Tax applied to this line; the amount is treated as tax-inclusive (same as a
    // categorized bank line). Persisted on expense_item.taxRateId.
    taxRateId: z.string().nullable().optional(),
    receiptFileKey: z.string().nullable().optional(),
    receiptFileName: z.string().nullable().optional(),
    // Mileage capture. When isMileage is true the amount is computed from
    // distance * rate; distanceMiles is miles x 100 (2 decimals), mileageRate is
    // cents per mile — both stored as integers on expense_item.
    isMileage: z.boolean().optional(),
    distanceMiles: z.number().int().min(0).nullable().optional(),
    mileageRate: z.number().int().min(0).nullable().optional(),
  })
  .refine(
    (item) =>
      !item.isMileage ||
      (item.distanceMiles != null && item.mileageRate != null),
    {
      message:
        "Mileage items require both distanceMiles and mileageRate when isMileage is true",
      path: ["distanceMiles"],
    }
  );

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  // Optional — when the client omits it, the org's base/default currency is
  // resolved below so non-USD orgs label expense claims correctly.
  currencyCode: currencyCodeSchema.optional(),
  items: z.array(itemSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");

    const conditions = [
      eq(expenseClaim.organizationId, ctx.organizationId),
      notDeleted(expenseClaim.deletedAt),
    ];

    if (status) {
      conditions.push(eq(expenseClaim.status, status as typeof expenseClaim.status.enumValues[number]));
    }

    const claims = await db.query.expenseClaim.findMany({
      where: and(...conditions),
      orderBy: desc(expenseClaim.createdAt),
      limit,
      offset,
      with: { submittedByUser: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(expenseClaim)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(claims, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:expenses");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    // Resolve the claim currency: explicit request wins, otherwise fall back to
    // the org's base/default currency so non-USD orgs are labelled correctly.
    const currencyCode = await resolveDocumentCurrency(
      ctx.organizationId,
      parsed.currencyCode,
      undefined
    );

    // Check period lock for each item date
    for (const item of parsed.items) {
      await assertNotLocked(ctx.organizationId, item.date);
    }

    // Calculate total from items
    let totalAmount = 0;
    const processedItems = parsed.items.map((item, i) => {
      const amount = decimalToMinorUnits(item.amount, currencyCode);
      totalAmount += amount;
      return {
        date: item.date,
        description: item.description,
        amount,
        category: item.category || null,
        accountId: item.accountId || null,
        taxRateId: item.taxRateId || null,
        isMileage: item.isMileage ?? false,
        distanceMiles: item.isMileage ? (item.distanceMiles ?? null) : null,
        mileageRate: item.isMileage ? (item.mileageRate ?? null) : null,
        receiptFileKey: item.receiptFileKey || null,
        receiptFileName: item.receiptFileName || null,
        sortOrder: i,
      };
    });

    const [created] = await db
      .insert(expenseClaim)
      .values({
        organizationId: ctx.organizationId,
        title: parsed.title,
        description: parsed.description || null,
        submittedBy: ctx.userId,
        totalAmount,
        currencyCode,
      })
      .returning();

    await db.insert(expenseItem).values(
      processedItems.map((item) => ({
        expenseClaimId: created.id,
        ...item,
      }))
    );

    logAudit({ ctx, action: "create", entityType: "expense", entityId: created.id, request });

    return NextResponse.json({ expenseClaim: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

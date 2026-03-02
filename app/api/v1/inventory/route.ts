import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem } from "@/lib/db/schema";
import { eq, and, or, ilike, lte, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  purchasePrice: z.number().int().min(0).default(0),
  salePrice: z.number().int().min(0).default(0),
  costAccountId: z.string().nullable().optional(),
  revenueAccountId: z.string().nullable().optional(),
  inventoryAccountId: z.string().nullable().optional(),
  quantityOnHand: z.number().int().default(0),
  reorderPoint: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const search = url.searchParams.get("search");
    const lowStock = url.searchParams.get("lowStock");

    const conditions = [
      eq(inventoryItem.organizationId, ctx.organizationId),
      notDeleted(inventoryItem.deletedAt),
    ];

    if (search) {
      conditions.push(
        or(
          ilike(inventoryItem.name, `%${search}%`),
          ilike(inventoryItem.code, `%${search}%`),
          ilike(inventoryItem.sku, `%${search}%`)
        )!
      );
    }

    if (lowStock === "true") {
      conditions.push(
        lte(inventoryItem.quantityOnHand, inventoryItem.reorderPoint)
      );
    }

    const items = await db.query.inventoryItem.findMany({
      where: and(...conditions),
      orderBy: desc(inventoryItem.createdAt),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: db.$count(inventoryItem) })
      .from(inventoryItem)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(items, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(inventoryItem)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    return NextResponse.json({ inventoryItem: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

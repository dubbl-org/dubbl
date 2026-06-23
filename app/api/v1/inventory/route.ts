import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem, journalEntry, journalLine } from "@/lib/db/schema";
import { eq, and, or, ilike, desc, asc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { recordInventoryReceipt, type ValuedItem } from "@/lib/api/inventory-valuation";
import {
  getNextEntryNumber,
  ensureControlAccount,
  ensureAccountByCode,
  resolveBaseRate,
} from "@/lib/api/journal-automation";
import { z } from "zod";

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SORT_COLUMNS: Record<string, any> = {
  name: inventoryItem.name,
  code: inventoryItem.code,
  quantity: inventoryItem.quantityOnHand,
  purchasePrice: inventoryItem.purchasePrice,
  salePrice: inventoryItem.salePrice,
  createdAt: inventoryItem.createdAt,
  category: inventoryItem.category,
};

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const search = url.searchParams.get("search");
    const category = url.searchParams.get("category");
    const categoryId = url.searchParams.get("categoryId");
    const status = url.searchParams.get("status"); // active, inactive, low_stock
    const sortBy = url.searchParams.get("sortBy") || "createdAt";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";

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

    if (categoryId) {
      conditions.push(eq(inventoryItem.categoryId, categoryId));
    } else if (category) {
      conditions.push(eq(inventoryItem.category, category));
    }

    if (status === "active") {
      conditions.push(eq(inventoryItem.isActive, true));
    } else if (status === "inactive") {
      conditions.push(eq(inventoryItem.isActive, false));
    } else if (status === "low_stock") {
      conditions.push(
        sql`${inventoryItem.quantityOnHand} <= ${inventoryItem.reorderPoint}`,
        eq(inventoryItem.isActive, true)
      );
    }

    const sortCol = SORT_COLUMNS[sortBy] || inventoryItem.createdAt;
    const orderFn = sortOrder === "asc" ? asc : desc;

    const items = await db.query.inventoryItem.findMany({
      where: and(...conditions),
      orderBy: orderFn(sortCol),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(inventoryItem)
      .where(and(...conditions));

    // Get distinct categories for filter options
    const categories = await db
      .selectDistinct({ category: inventoryItem.category })
      .from(inventoryItem)
      .where(
        and(
          eq(inventoryItem.organizationId, ctx.organizationId),
          notDeleted(inventoryItem.deletedAt),
          sql`${inventoryItem.category} IS NOT NULL`
        )
      );

    // Summary stats (always unfiltered, org-wide)
    const orgConditions = [
      eq(inventoryItem.organizationId, ctx.organizationId),
      notDeleted(inventoryItem.deletedAt),
    ];

    const [summary] = await db
      .select({
        totalItems: sql<number>`count(*)::int`,
        totalValue: sql<number>`coalesce(sum(${inventoryItem.quantityOnHand} * ${inventoryItem.purchasePrice}), 0)::bigint`,
        lowStockCount: sql<number>`count(*) filter (where ${inventoryItem.quantityOnHand} <= ${inventoryItem.reorderPoint} and ${inventoryItem.isActive} = true)::int`,
        avgMargin: sql<number>`coalesce(avg(case when ${inventoryItem.purchasePrice} > 0 then (${inventoryItem.salePrice} - ${inventoryItem.purchasePrice})::float / ${inventoryItem.purchasePrice} * 100 end), 0)`,
      })
      .from(inventoryItem)
      .where(and(...orgConditions));

    return NextResponse.json({
      ...paginatedResponse(items, Number(countResult?.count || 0), page, limit),
      categories: categories.map((c) => c.category).filter(Boolean),
      summary: {
        totalItems: Number(summary?.totalItems || 0),
        totalValue: Number(summary?.totalValue || 0),
        lowStockCount: Number(summary?.lowStockCount || 0),
        avgMargin: Number(summary?.avgMargin || 0),
      },
    });
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

    const openingQty = parsed.quantityOnHand ?? 0;
    const unitCost = parsed.purchasePrice ?? 0;
    const hasOpeningStock = openingQty > 0 && unitCost > 0;

    const created = await db.transaction(async (tx) => {
      // Insert at zero on-hand/value, then add any opening stock through the
      // valuation path so averageCost / totalValue / FIFO layers are set. Storing
      // a quantity without a cost (the old behaviour) left stock at $0, so every
      // later sale posted $0 COGS and overstated profit.
      const [item] = await tx
        .insert(inventoryItem)
        .values({
          organizationId: ctx.organizationId,
          ...parsed,
          quantityOnHand: 0,
          averageCost: 0,
          totalValue: 0,
        })
        .returning();

      if (hasOpeningStock) {
        await recordInventoryReceipt(tx, {
          item: item as ValuedItem,
          quantity: openingQty,
          unitCost,
          type: "initial",
          referenceType: "opening_balance",
          referenceId: item.id,
          createdBy: ctx.userId,
        });

        // Post the opening balance to the GL: DR Inventory / CR Opening Balance
        // Equity (the standard counter-account for starting balances), so the
        // balance sheet reflects the stock you began with.
        const today = new Date().toISOString().slice(0, 10);
        const { base } = await resolveBaseRate(ctx.organizationId, undefined, today);
        const invAcct =
          (item.inventoryAccountId ? { id: item.inventoryAccountId } : null) ??
          (await ensureControlAccount(ctx.organizationId, "inventory", base, tx));
        const openingEquity = await ensureAccountByCode(
          ctx.organizationId,
          { code: "3000", name: "Opening Balance Equity", type: "equity", subType: "other_equity" },
          base,
          tx
        );
        const value = openingQty * unitCost;
        if (invAcct?.id && openingEquity?.id && value > 0) {
          const entryNumber = await getNextEntryNumber(ctx.organizationId, tx);
          const [entry] = await tx
            .insert(journalEntry)
            .values({
              organizationId: ctx.organizationId,
              entryNumber,
              date: today,
              description: `Opening stock: ${item.name}`,
              reference: item.sku ?? null,
              status: "posted",
              sourceType: "inventory_opening",
              sourceId: item.id,
              postedAt: new Date(),
              createdBy: ctx.userId,
            })
            .returning();
          await tx.insert(journalLine).values([
            { journalEntryId: entry.id, accountId: invAcct.id, description: `Opening stock: ${item.name}`, debitAmount: value, creditAmount: 0, currencyCode: base },
            { journalEntryId: entry.id, accountId: openingEquity.id, description: `Opening stock: ${item.name}`, debitAmount: 0, creditAmount: value, currencyCode: base },
          ]);
        }
      }

      return (
        (await tx.query.inventoryItem.findFirst({ where: eq(inventoryItem.id, item.id) })) ?? item
      );
    });

    logAudit({ ctx, action: "create", entityType: "inventory_item", entityId: created.id, request });

    return NextResponse.json({ inventoryItem: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

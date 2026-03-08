import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryCategory } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const categories = await db.query.inventoryCategory.findMany({
      where: and(
        eq(inventoryCategory.organizationId, ctx.organizationId),
        notDeleted(inventoryCategory.deletedAt)
      ),
      orderBy: asc(inventoryCategory.name),
    });

    // Build tree structure
    const rootCategories = categories.filter((c) => !c.parentId);
    const childMap = new Map<string, typeof categories>();
    for (const cat of categories) {
      if (cat.parentId) {
        const existing = childMap.get(cat.parentId) || [];
        existing.push(cat);
        childMap.set(cat.parentId, existing);
      }
    }

    const tree = rootCategories.map((cat) => ({
      ...cat,
      children: childMap.get(cat.id) || [],
    }));

    return NextResponse.json({ data: tree, flat: categories });
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
      .insert(inventoryCategory)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    return NextResponse.json({ category: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

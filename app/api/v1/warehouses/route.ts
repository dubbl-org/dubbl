import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { warehouse } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const items = await db.query.warehouse.findMany({
      where: and(
        eq(warehouse.organizationId, ctx.organizationId),
        notDeleted(warehouse.deletedAt)
      ),
      orderBy: asc(warehouse.name),
    });

    return NextResponse.json({ data: items });
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
      .insert(warehouse)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    return NextResponse.json({ warehouse: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

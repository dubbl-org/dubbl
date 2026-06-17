import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { priceList } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  currencyCode: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: z.string().nullable().optional(),
  effectiveTo: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const lists = await db.query.priceList.findMany({
      where: and(
        eq(priceList.organizationId, ctx.organizationId),
        notDeleted(priceList.deletedAt)
      ),
      orderBy: asc(priceList.name),
    });

    return NextResponse.json({ data: lists });
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
      .insert(priceList)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        currencyCode: parsed.currencyCode ?? "USD",
        isActive: parsed.isActive ?? true,
        effectiveFrom: parsed.effectiveFrom ?? null,
        effectiveTo: parsed.effectiveTo ?? null,
      })
      .returning();

    logAudit({
      ctx,
      action: "create",
      entityType: "price_list",
      entityId: created.id,
      changes: created as Record<string, unknown>,
      request,
    });

    return NextResponse.json({ priceList: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

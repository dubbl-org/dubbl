import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assetCategory } from "@/lib/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const depreciationMethodEnum = z.enum([
  "straight_line",
  "declining_balance",
  "units_of_production",
  "sum_of_years_digits",
]);

const conventionEnum = z.enum([
  "full_month",
  "mid_month",
  "half_year",
  "mid_quarter",
  "pro_rata_days",
  "full_at_purchase",
]);

const createSchema = z.object({
  name: z.string().min(1),
  defaultDepreciationMethod: depreciationMethodEnum.default("straight_line"),
  defaultConvention: conventionEnum.default("full_month"),
  defaultUsefulLifeMonths: z.number().int().min(1).nullable().optional(),
  defaultResidualValue: z.number().int().min(0).default(0),
  defaultDepreciationRateBp: z.number().int().min(0).max(100000).nullable().optional(),
  assetAccountId: z.string().uuid().nullable().optional(),
  depreciationAccountId: z.string().uuid().nullable().optional(),
  accumulatedDepAccountId: z.string().uuid().nullable().optional(),
  cwipAccountId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const activeParam = url.searchParams.get("isActive");

    const conditions = [
      eq(assetCategory.organizationId, ctx.organizationId),
      notDeleted(assetCategory.deletedAt),
    ];

    if (activeParam !== null) {
      conditions.push(eq(assetCategory.isActive, activeParam === "true"));
    }

    const categories = await db.query.assetCategory.findMany({
      where: and(...conditions),
      orderBy: asc(assetCategory.name),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(assetCategory)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(categories, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:assets");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(assetCategory)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        defaultDepreciationMethod: parsed.defaultDepreciationMethod,
        defaultConvention: parsed.defaultConvention,
        defaultUsefulLifeMonths: parsed.defaultUsefulLifeMonths ?? null,
        defaultResidualValue: parsed.defaultResidualValue,
        defaultDepreciationRateBp: parsed.defaultDepreciationRateBp ?? null,
        assetAccountId: parsed.assetAccountId ?? null,
        depreciationAccountId: parsed.depreciationAccountId ?? null,
        accumulatedDepAccountId: parsed.accumulatedDepAccountId ?? null,
        cwipAccountId: parsed.cwipAccountId ?? null,
        isActive: parsed.isActive,
      })
      .returning();

    logAudit({
      ctx,
      action: "create",
      entityType: "asset_category",
      entityId: created.id,
      request,
    });

    return NextResponse.json({ category: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

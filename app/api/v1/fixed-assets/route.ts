import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fixedAsset, assetCategory } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, validationError } from "@/lib/api/response";
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
  description: z.string().nullable().optional(),
  assetNumber: z.string().min(1),
  // When set, the category's defaults are copied onto the new asset for any
  // depreciation/posting field not explicitly provided in the request.
  categoryId: z.string().uuid().nullable().optional(),
  purchaseDate: z.string().min(1),
  // Date placed in service; defaults to purchaseDate when omitted.
  inServiceDate: z.string().nullable().optional(),
  purchasePrice: z.number().int().min(0),
  residualValue: z.number().int().min(0).optional(),
  usefulLifeMonths: z.number().int().min(1).optional(),
  depreciationMethod: depreciationMethodEnum.optional(),
  convention: conventionEnum.optional(),
  // Units-of-production inputs.
  totalExpectedUnits: z.number().int().min(0).nullable().optional(),
  unitOfMeasure: z.string().nullable().optional(),
  // Capital-work-in-progress.
  isCwip: z.boolean().optional(),
  cwipAccountId: z.string().uuid().nullable().optional(),
  assetAccountId: z.string().uuid().nullable().optional(),
  depreciationAccountId: z.string().uuid().nullable().optional(),
  accumulatedDepAccountId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");

    const conditions = [
      eq(fixedAsset.organizationId, ctx.organizationId),
      notDeleted(fixedAsset.deletedAt),
    ];

    if (status) {
      conditions.push(
        eq(
          fixedAsset.status,
          status as (typeof fixedAsset.status.enumValues)[number]
        )
      );
    }

    const assets = await db.query.fixedAsset.findMany({
      where: and(...conditions),
      orderBy: desc(fixedAsset.createdAt),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(fixedAsset)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(assets, Number(countResult?.count || 0), page, limit)
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

    // When created from a category, copy that category's defaults for any field
    // the caller did not explicitly supply (request values always win).
    let category: typeof assetCategory.$inferSelect | undefined;
    if (parsed.categoryId) {
      category = await db.query.assetCategory.findFirst({
        where: and(
          eq(assetCategory.id, parsed.categoryId),
          eq(assetCategory.organizationId, ctx.organizationId),
          notDeleted(assetCategory.deletedAt)
        ),
      });
      if (!category) return validationError("Asset category not found");
    }

    const residualValue =
      parsed.residualValue ?? category?.defaultResidualValue ?? 0;
    const usefulLifeMonths =
      parsed.usefulLifeMonths ?? category?.defaultUsefulLifeMonths ?? null;
    const depreciationMethod =
      parsed.depreciationMethod ??
      category?.defaultDepreciationMethod ??
      "straight_line";
    const convention =
      parsed.convention ?? category?.defaultConvention ?? "full_month";
    const assetAccountId =
      parsed.assetAccountId ?? category?.assetAccountId ?? null;
    const depreciationAccountId =
      parsed.depreciationAccountId ?? category?.depreciationAccountId ?? null;
    const accumulatedDepAccountId =
      parsed.accumulatedDepAccountId ??
      category?.accumulatedDepAccountId ??
      null;
    const cwipAccountId =
      parsed.cwipAccountId ?? category?.cwipAccountId ?? null;
    const isCwip = parsed.isCwip ?? false;
    const inServiceDate = parsed.inServiceDate ?? parsed.purchaseDate;

    if (usefulLifeMonths === null || usefulLifeMonths < 1) {
      return validationError(
        "usefulLifeMonths is required (directly or via category default)"
      );
    }

    const [created] = await db
      .insert(fixedAsset)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        description: parsed.description || null,
        assetNumber: parsed.assetNumber,
        categoryId: parsed.categoryId ?? null,
        purchaseDate: parsed.purchaseDate,
        inServiceDate,
        purchasePrice: parsed.purchasePrice,
        residualValue,
        usefulLifeMonths,
        depreciationMethod,
        convention,
        totalExpectedUnits: parsed.totalExpectedUnits ?? null,
        unitOfMeasure: parsed.unitOfMeasure ?? null,
        netBookValue: parsed.purchasePrice,
        assetAccountId,
        depreciationAccountId,
        accumulatedDepAccountId,
        isCwip,
        cwipAccountId,
        // A CWIP asset is not yet in service; mark its status accordingly.
        status: isCwip ? "in_progress" : "active",
      })
      .returning();

    logAudit({ ctx, action: "create", entityType: "fixed_asset", entityId: created.id, request });

    return NextResponse.json({ asset: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

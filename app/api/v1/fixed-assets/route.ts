import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fixedAsset } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  assetNumber: z.string().min(1),
  purchaseDate: z.string().min(1),
  purchasePrice: z.number().int().min(0),
  residualValue: z.number().int().min(0).default(0),
  usefulLifeMonths: z.number().int().min(1),
  depreciationMethod: z
    .enum(["straight_line", "declining_balance"])
    .default("straight_line"),
  assetAccountId: z.string().nullable().optional(),
  depreciationAccountId: z.string().nullable().optional(),
  accumulatedDepAccountId: z.string().nullable().optional(),
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

    const [created] = await db
      .insert(fixedAsset)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        description: parsed.description || null,
        assetNumber: parsed.assetNumber,
        purchaseDate: parsed.purchaseDate,
        purchasePrice: parsed.purchasePrice,
        residualValue: parsed.residualValue,
        usefulLifeMonths: parsed.usefulLifeMonths,
        depreciationMethod: parsed.depreciationMethod,
        netBookValue: parsed.purchasePrice,
        assetAccountId: parsed.assetAccountId || null,
        depreciationAccountId: parsed.depreciationAccountId || null,
        accumulatedDepAccountId: parsed.accumulatedDepAccountId || null,
      })
      .returning();

    logAudit({ ctx, action: "create", entityType: "fixed_asset", entityId: created.id, request });

    return NextResponse.json({ asset: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

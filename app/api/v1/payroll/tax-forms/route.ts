import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxFormGeneration, taxForm } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const taxYear = url.searchParams.get("taxYear");
    const formType = url.searchParams.get("formType");

    const conditions = [
      eq(taxFormGeneration.organizationId, ctx.organizationId),
      notDeleted(taxFormGeneration.deletedAt),
    ];

    if (taxYear) conditions.push(eq(taxFormGeneration.taxYear, parseInt(taxYear)));
    if (formType && ["1099_nec", "1099_misc", "w2"].includes(formType)) {
      conditions.push(eq(taxFormGeneration.formType, formType as "1099_nec"));
    }

    const items = await db.query.taxFormGeneration.findMany({
      where: and(...conditions),
      orderBy: desc(taxFormGeneration.createdAt),
      limit,
      offset,
      with: { forms: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(taxFormGeneration)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(items, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

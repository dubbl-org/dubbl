import { db } from "@/lib/db";
import { contractor } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError, ok, created } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";

// Blank optional text fields arrive as "" or null from forms; store them as null
const blankToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const createSchema = z.object({
  name: z.string().trim().min(1),
  email: z.preprocess(blankToNull, z.string().trim().email().nullable().optional()),
  company: z.preprocess(blankToNull, z.string().trim().nullable().optional()),
  taxId: z.preprocess(blankToNull, z.string().trim().nullable().optional()),
  hourlyRate: z.number().int().min(0).nullable().optional(), // cents
  currency: currencyCodeSchema.optional(),
  bankAccountNumber: z.preprocess(blankToNull, z.string().trim().nullable().optional()),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contractors");

    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const isActive = url.searchParams.get("isActive");

    const conditions = [
      eq(contractor.organizationId, ctx.organizationId),
      notDeleted(contractor.deletedAt),
    ];

    if (isActive === "true") conditions.push(eq(contractor.isActive, true));
    if (isActive === "false") conditions.push(eq(contractor.isActive, false));

    const contractors = await db.query.contractor.findMany({
      where: and(...conditions),
      orderBy: desc(contractor.createdAt),
      // Lists never carry tax IDs or bank numbers; open a contractor to see them
      columns: { taxId: false, bankAccountNumber: false },
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(contractor)
      .where(and(...conditions));

    return ok(paginatedResponse(contractors, Number(countResult?.count || 0), page, limit));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contractors");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [c] = await db
      .insert(contractor)
      .values({ organizationId: ctx.organizationId, ...parsed })
      .returning();

    logAudit({ ctx, action: "create", entityType: "contractor", entityId: c.id, request });

    return created({ contractor: c });
  } catch (err) {
    return handleError(err);
  }
}

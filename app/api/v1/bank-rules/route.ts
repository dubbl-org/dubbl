import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankRule } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  priority: z.number().int().default(0),
  matchField: z.string().default("description"),
  matchType: z.enum(["contains", "equals", "starts_with", "ends_with"]),
  matchValue: z.string().min(1),
  accountId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
  autoReconcile: z.boolean().default(false),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [
      eq(bankRule.organizationId, ctx.organizationId),
      notDeleted(bankRule.deletedAt),
    ];

    const rules = await db.query.bankRule.findMany({
      where: and(...conditions),
      orderBy: desc(bankRule.priority),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(bankRule)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(rules, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:bank-rules");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(bankRule)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        priority: parsed.priority,
        matchField: parsed.matchField,
        matchType: parsed.matchType,
        matchValue: parsed.matchValue,
        accountId: parsed.accountId || null,
        contactId: parsed.contactId || null,
        taxRateId: parsed.taxRateId || null,
        autoReconcile: parsed.autoReconcile,
      })
      .returning();

    return NextResponse.json({ bankRule: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

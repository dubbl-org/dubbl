import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bankRule } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

// A single multi-condition test. Text ops match case-insensitively; amount ops
// compare integer cents (`between` value is "min,max").
const conditionSchema = z.object({
  field: z.enum(["description", "reference", "amount", "payee", "counterparty"]),
  op: z.enum([
    "contains",
    "equals",
    "starts_with",
    "ends_with",
    "gt",
    "lt",
    "between",
  ]),
  value: z.string().min(1),
});

// Split a matched transaction across several accounts. `amount` (integer cents)
// takes precedence over `percent` (0-100); the last allocation absorbs any
// rounding remainder so splits always sum to the transaction total.
const splitAllocationSchema = z.object({
  accountId: z.string().min(1),
  percent: z.number().min(0).max(100).optional(),
  amount: z.number().int().optional(),
  taxRateId: z.string().optional(),
});

const createSchema = z
  .object({
    name: z.string().min(1),
    priority: z.number().int().default(0),
    matchField: z.string().default("description"),
    // Legacy single condition. Optional when `conditions` is provided.
    matchType: z
      .enum(["contains", "equals", "starts_with", "ends_with"])
      .optional(),
    matchValue: z.string().min(1).optional(),
    // Multi-condition rule. When non-empty it supersedes the legacy fields.
    conditions: z.array(conditionSchema).default([]),
    matchAll: z.boolean().default(true),
    splitAllocations: z.array(splitAllocationSchema).nullable().optional(),
    accountId: z.string().nullable().optional(),
    contactId: z.string().nullable().optional(),
    taxRateId: z.string().nullable().optional(),
    autoReconcile: z.boolean().default(false),
  })
  .refine(
    (v) => v.conditions.length > 0 || (v.matchType != null && v.matchValue != null),
    {
      message:
        "Provide either `conditions` or the legacy `matchType` and `matchValue`.",
    }
  );

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
        // matchType/matchValue are NOT NULL columns; when a multi-condition rule
        // is used they're superseded by `conditions`, so store harmless defaults.
        matchType: parsed.matchType ?? "contains",
        matchValue: parsed.matchValue ?? "",
        conditions: parsed.conditions,
        matchAll: parsed.matchAll,
        splitAllocations: parsed.splitAllocations ?? null,
        accountId: parsed.accountId || null,
        contactId: parsed.contactId || null,
        taxRateId: parsed.taxRateId || null,
        autoReconcile: parsed.autoReconcile,
      })
      .returning();

    logAudit({ ctx, action: "create", entityType: "bank_rule", entityId: created.id, request });

    return NextResponse.json({ bankRule: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

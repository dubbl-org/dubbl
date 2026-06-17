import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recurringTemplate, recurringTemplateLine } from "@/lib/db/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

// A journal-template leg: posts debitAmount/creditAmount (integer cents) to
// accountId verbatim. Exactly one of debit/credit is non-zero per leg.
const legSchema = z
  .object({
    description: z.string().min(1),
    accountId: z.string().min(1),
    debitAmount: z.number().int().min(0).default(0),
    creditAmount: z.number().int().min(0).default(0),
    costCenterId: z.string().nullable().optional(),
  })
  .refine((l) => (l.debitAmount > 0) !== (l.creditAmount > 0), {
    message: "Each leg must have exactly one of debitAmount or creditAmount non-zero",
  });

const createSchema = z
  .object({
    name: z.string().min(1),
    frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "semi_annual", "annual"]),
    startDate: z.string().min(1),
    endDate: z.string().nullable().optional(),
    maxOccurrences: z.number().int().min(1).nullable().optional(),
    reference: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    currencyCode: z.string().optional(),
    lines: z.array(legSchema).min(2),
  })
  .refine(
    (b) => {
      const dr = b.lines.reduce((s, l) => s + l.debitAmount, 0);
      const cr = b.lines.reduce((s, l) => s + l.creditAmount, 0);
      return dr === cr && dr > 0;
    },
    { message: "Journal must be balanced (total debits = total credits, non-zero)" }
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SORT_COLUMNS: Record<string, any> = {
  created: recurringTemplate.createdAt,
  name: recurringTemplate.name,
  frequency: recurringTemplate.frequency,
  nextRun: recurringTemplate.nextRunDate,
  startDate: recurringTemplate.startDate,
};

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const status = url.searchParams.get("status");
    const frequency = url.searchParams.get("frequency");
    const sortBy = url.searchParams.get("sortBy") || "created";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";

    const conditions = [
      eq(recurringTemplate.organizationId, ctx.organizationId),
      eq(recurringTemplate.type, "journal"),
      notDeleted(recurringTemplate.deletedAt),
    ];

    if (status && ["active", "paused", "completed"].includes(status)) {
      conditions.push(
        eq(recurringTemplate.status, status as "active" | "paused" | "completed")
      );
    }
    if (
      frequency &&
      ["weekly", "fortnightly", "monthly", "quarterly", "semi_annual", "annual"].includes(frequency)
    ) {
      conditions.push(
        eq(recurringTemplate.frequency, frequency as typeof recurringTemplate.frequency.enumValues[number])
      );
    }

    const sortCol = SORT_COLUMNS[sortBy] || recurringTemplate.createdAt;
    const orderFn = sortOrder === "asc" ? asc : desc;

    const templates = await db.query.recurringTemplate.findMany({
      where: and(...conditions),
      orderBy: orderFn(sortCol),
      limit,
      offset,
      with: { lines: true },
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(recurringTemplate)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(templates, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:recurring");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(recurringTemplate)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        type: "journal",
        contactId: null,
        frequency: parsed.frequency,
        startDate: parsed.startDate,
        endDate: parsed.endDate || null,
        nextRunDate: parsed.startDate,
        maxOccurrences: parsed.maxOccurrences || null,
        reference: parsed.reference || null,
        notes: parsed.notes || null,
        currencyCode: parsed.currencyCode || "USD",
        createdBy: ctx.userId,
      })
      .returning();

    await db.insert(recurringTemplateLine).values(
      parsed.lines.map((l, i) => ({
        templateId: created.id,
        description: l.description,
        accountId: l.accountId,
        debitAmount: l.debitAmount,
        creditAmount: l.creditAmount,
        costCenterId: l.costCenterId || null,
        sortOrder: i,
      }))
    );

    logAudit({ ctx, action: "create", entityType: "recurring_journal", entityId: created.id, request });

    return NextResponse.json({ template: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

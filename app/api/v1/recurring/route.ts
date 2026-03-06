import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recurringTemplate, recurringTemplateLine } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { processRecurringTemplates } from "@/lib/api/recurring-generate";
import { z } from "zod";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  accountId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["invoice", "bill"]),
  contactId: z.string().min(1),
  frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "semi_annual", "annual"]),
  startDate: z.string().min(1),
  endDate: z.string().nullable().optional(),
  maxOccurrences: z.number().int().min(1).nullable().optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const type = url.searchParams.get("type");
    const status = url.searchParams.get("status");

    // Process any due templates before listing
    await processRecurringTemplates(ctx.organizationId);

    const conditions = [
      eq(recurringTemplate.organizationId, ctx.organizationId),
      notDeleted(recurringTemplate.deletedAt),
    ];

    if (type && ["invoice", "bill"].includes(type)) {
      conditions.push(eq(recurringTemplate.type, type));
    }
    if (status && ["active", "paused", "completed"].includes(status)) {
      conditions.push(eq(recurringTemplate.status, status as "active" | "paused" | "completed"));
    }

    const templates = await db.query.recurringTemplate.findMany({
      where: and(...conditions),
      orderBy: desc(recurringTemplate.createdAt),
      limit,
      offset,
      with: { contact: true },
    });

    const [countResult] = await db
      .select({ count: db.$count(recurringTemplate) })
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
        type: parsed.type,
        contactId: parsed.contactId,
        frequency: parsed.frequency,
        startDate: parsed.startDate,
        endDate: parsed.endDate || null,
        nextRunDate: parsed.startDate,
        maxOccurrences: parsed.maxOccurrences || null,
        reference: parsed.reference || null,
        notes: parsed.notes || null,
        createdBy: ctx.userId,
      })
      .returning();

    await db.insert(recurringTemplateLine).values(
      parsed.lines.map((l, i) => ({
        templateId: created.id,
        description: l.description,
        quantity: Math.round(l.quantity * 100),
        unitPrice: Math.round(l.unitPrice * 100),
        accountId: l.accountId || null,
        taxRateId: l.taxRateId || null,
        sortOrder: i,
      }))
    );

    return NextResponse.json({ template: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

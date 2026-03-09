import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reminderRule } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  triggerType: z.enum(["before_due", "on_due", "after_due"]),
  triggerDays: z.number().int().min(0),
  enabled: z.boolean().default(false),
  subjectTemplate: z.string().min(1),
  bodyTemplate: z.string().min(1),
  documentType: z.enum(["invoice", "bill"]),
  recipientType: z.enum(["contact_email", "contact_persons", "custom"]),
  customEmails: z.array(z.string().email()).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);

    const conditions = [
      eq(reminderRule.organizationId, ctx.organizationId),
      notDeleted(reminderRule.deletedAt),
    ];

    const rules = await db.query.reminderRule.findMany({
      where: and(...conditions),
      orderBy: desc(reminderRule.createdAt),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(reminderRule)
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
    requireRole(ctx, "manage:settings");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(reminderRule)
      .values({
        organizationId: ctx.organizationId,
        name: parsed.name,
        triggerType: parsed.triggerType,
        triggerDays: parsed.triggerDays,
        enabled: parsed.enabled,
        subjectTemplate: parsed.subjectTemplate,
        bodyTemplate: parsed.bodyTemplate,
        documentType: parsed.documentType,
        recipientType: parsed.recipientType,
        customEmails: parsed.customEmails || null,
      })
      .returning();

    return NextResponse.json({ reminderRule: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

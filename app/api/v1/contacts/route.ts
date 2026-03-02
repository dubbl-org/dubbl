import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contact } from "@/lib/db/schema";
import { eq, and, or, ilike, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  taxNumber: z.string().nullable().optional(),
  type: z.enum(["customer", "supplier", "both"]).default("customer"),
  paymentTermsDays: z.number().int().min(0).default(30),
  addresses: z.any().optional(),
  notes: z.string().nullable().optional(),
  currencyCode: z.string().default("USD"),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const search = url.searchParams.get("search");
    const type = url.searchParams.get("type");

    const conditions = [
      eq(contact.organizationId, ctx.organizationId),
      notDeleted(contact.deletedAt),
    ];

    if (search) {
      conditions.push(
        or(
          ilike(contact.name, `%${search}%`),
          ilike(contact.email, `%${search}%`)
        )!
      );
    }
    if (type && ["customer", "supplier", "both"].includes(type)) {
      conditions.push(eq(contact.type, type as "customer" | "supplier" | "both"));
    }

    const contacts = await db.query.contact.findMany({
      where: and(...conditions),
      orderBy: desc(contact.createdAt),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: db.$count(contact) })
      .from(contact)
      .where(and(...conditions));

    return NextResponse.json(
      paginatedResponse(contacts, Number(countResult?.count || 0), page, limit)
    );
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:contacts");

    const body = await request.json();
    const parsed = createSchema.parse(body);

    const [created] = await db
      .insert(contact)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    return NextResponse.json({ contact: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

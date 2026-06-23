import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contact, invoice, bill } from "@/lib/db/schema";
import { eq, and, or, ilike, desc, asc, gte, lte, inArray, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { checkResourceLimit, checkMultiCurrency } from "@/lib/api/check-limit";
import { logAudit } from "@/lib/api/audit";
import { z } from "zod";
import { currencyCodeSchema } from "@/lib/currency/zod";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  taxNumber: z.string().nullable().optional(),
  type: z.enum(["customer", "supplier", "both"]).default("customer"),
  paymentTermsDays: z.number().int().min(0).default(30),
  addresses: z.any().optional(),
  notes: z.string().nullable().optional(),
  currencyCode: currencyCodeSchema.default("USD"),
});

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { page, limit, offset } = parsePagination(url);
    const search = url.searchParams.get("search");
    const type = url.searchParams.get("type");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const sortBy = url.searchParams.get("sortBy") || "created";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SORT_COLUMNS: Record<string, any> = {
      name: contact.name,
      type: contact.type,
      terms: contact.paymentTermsDays,
      creditLimit: contact.creditLimit,
      created: contact.createdAt,
    };

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
    if (from) conditions.push(gte(contact.createdAt, new Date(from)));
    if (to) conditions.push(lte(contact.createdAt, new Date(to + "T23:59:59")));

    const sortCol = SORT_COLUMNS[sortBy] || contact.createdAt;
    const orderFn = sortOrder === "asc" ? asc : desc;

    const contacts = await db.query.contact.findMany({
      where: and(...conditions),
      orderBy: orderFn(sortCol),
      limit,
      offset,
    });

    const [countResult] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(contact)
      .where(and(...conditions));

    // Outstanding balance + overdue per contact (for the current page only, org-scoped).
    // Customer balance = unpaid invoices ("Owes you"); supplier balance = unpaid bills ("You owe").
    const contactIds = contacts.map((c) => c.id);
    const owedByCustomer = new Map<string, { outstanding: number; overdue: number }>();
    const owedToSupplier = new Map<string, { outstanding: number; overdue: number }>();

    if (contactIds.length > 0) {
      // Invoices the org has issued -> what customers owe the org.
      const invoiceRows = await db
        .select({
          contactId: invoice.contactId,
          outstanding: sql<number>`coalesce(sum(${invoice.amountDue}), 0)::int`,
          overdue: sql<number>`coalesce(sum(case when ${invoice.dueDate} < current_date then ${invoice.amountDue} else 0 end), 0)::int`,
        })
        .from(invoice)
        .where(
          and(
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt),
            inArray(invoice.contactId, contactIds),
            inArray(invoice.status, ["sent", "partial", "overdue"]),
          )
        )
        .groupBy(invoice.contactId);
      for (const row of invoiceRows) {
        owedByCustomer.set(row.contactId, { outstanding: row.outstanding, overdue: row.overdue });
      }

      // Bills the org has received -> what the org owes suppliers.
      const billRows = await db
        .select({
          contactId: bill.contactId,
          outstanding: sql<number>`coalesce(sum(${bill.amountDue}), 0)::int`,
          overdue: sql<number>`coalesce(sum(case when ${bill.dueDate} < current_date then ${bill.amountDue} else 0 end), 0)::int`,
        })
        .from(bill)
        .where(
          and(
            eq(bill.organizationId, ctx.organizationId),
            notDeleted(bill.deletedAt),
            inArray(bill.contactId, contactIds),
            inArray(bill.status, ["received", "partial", "overdue"]),
          )
        )
        .groupBy(bill.contactId);
      for (const row of billRows) {
        owedToSupplier.set(row.contactId, { outstanding: row.outstanding, overdue: row.overdue });
      }
    }

    const contactsWithBalance = contacts.map((c) => {
      const customer = owedByCustomer.get(c.id) || { outstanding: 0, overdue: 0 };
      const supplier = owedToSupplier.get(c.id) || { outstanding: 0, overdue: 0 };
      return {
        ...c,
        owesYou: customer.outstanding, // customer outstanding (cents)
        youOwe: supplier.outstanding, // supplier outstanding (cents)
        overdue: customer.overdue + supplier.overdue, // total overdue across both (cents)
      };
    });

    return NextResponse.json(
      paginatedResponse(contactsWithBalance, Number(countResult?.count || 0), page, limit)
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

    await checkResourceLimit(ctx.organizationId, contact, contact.organizationId, "contacts", contact.deletedAt);
    await checkMultiCurrency(ctx.organizationId, parsed.currencyCode);

    const [created] = await db
      .insert(contact)
      .values({
        organizationId: ctx.organizationId,
        ...parsed,
      })
      .returning();

    logAudit({ ctx, action: "create", entityType: "contact", entityId: created.id, request });

    return NextResponse.json({ contact: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

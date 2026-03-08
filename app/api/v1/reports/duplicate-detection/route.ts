import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice, bill, contact } from "@/lib/db/schema";
import { eq, and, isNull, sql, notInArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";

interface DuplicateGroup {
  type: "invoice" | "bill";
  contactName: string;
  amount: number;
  items: {
    id: string;
    number: string;
    date: string;
    status: string;
  }[];
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    // Find invoices with same contact + same total + dates within 7 days
    const invoiceDupes = await db
      .select({
        contactId: invoice.contactId,
        contactName: contact.name,
        total: invoice.total,
        ids: sql<string>`ARRAY_AGG(${invoice.id})`.as("ids"),
        numbers: sql<string>`ARRAY_AGG(${invoice.invoiceNumber})`.as("numbers"),
        dates: sql<string>`ARRAY_AGG(${invoice.issueDate})`.as("dates"),
        statuses: sql<string>`ARRAY_AGG(${invoice.status})`.as("statuses"),
        count: sql<number>`COUNT(*)`,
        dateSpan: sql<number>`MAX(${invoice.issueDate}::date) - MIN(${invoice.issueDate}::date)`,
      })
      .from(invoice)
      .innerJoin(contact, eq(invoice.contactId, contact.id))
      .where(
        and(
          eq(invoice.organizationId, ctx.organizationId),
          notInArray(invoice.status, ["void"]),
          isNull(invoice.deletedAt)
        )
      )
      .groupBy(invoice.contactId, contact.name, invoice.total)
      .having(
        and(
          sql`COUNT(*) > 1`,
          sql`MAX(${invoice.issueDate}::date) - MIN(${invoice.issueDate}::date) <= 7`
        )
      );

    // Find bills with same contact + same total + dates within 7 days
    const billDupes = await db
      .select({
        contactId: bill.contactId,
        contactName: contact.name,
        total: bill.total,
        ids: sql<string>`ARRAY_AGG(${bill.id})`.as("ids"),
        numbers: sql<string>`ARRAY_AGG(${bill.billNumber})`.as("numbers"),
        dates: sql<string>`ARRAY_AGG(${bill.issueDate})`.as("dates"),
        statuses: sql<string>`ARRAY_AGG(${bill.status})`.as("statuses"),
        count: sql<number>`COUNT(*)`,
        dateSpan: sql<number>`MAX(${bill.issueDate}::date) - MIN(${bill.issueDate}::date)`,
      })
      .from(bill)
      .innerJoin(contact, eq(bill.contactId, contact.id))
      .where(
        and(
          eq(bill.organizationId, ctx.organizationId),
          notInArray(bill.status, ["void"]),
          isNull(bill.deletedAt)
        )
      )
      .groupBy(bill.contactId, contact.name, bill.total)
      .having(
        and(
          sql`COUNT(*) > 1`,
          sql`MAX(${bill.issueDate}::date) - MIN(${bill.issueDate}::date) <= 7`
        )
      );

    const groups: DuplicateGroup[] = [];

    for (const d of invoiceDupes) {
      const ids = (d.ids as unknown as string[]) || [];
      const numbers = (d.numbers as unknown as string[]) || [];
      const dates = (d.dates as unknown as string[]) || [];
      const statuses = (d.statuses as unknown as string[]) || [];

      groups.push({
        type: "invoice",
        contactName: d.contactName,
        amount: d.total,
        items: ids.map((id, i) => ({
          id,
          number: numbers[i] || "",
          date: dates[i] || "",
          status: statuses[i] || "",
        })),
      });
    }

    for (const d of billDupes) {
      const ids = (d.ids as unknown as string[]) || [];
      const numbers = (d.numbers as unknown as string[]) || [];
      const dates = (d.dates as unknown as string[]) || [];
      const statuses = (d.statuses as unknown as string[]) || [];

      groups.push({
        type: "bill",
        contactName: d.contactName,
        amount: d.total,
        items: ids.map((id, i) => ({
          id,
          number: numbers[i] || "",
          date: dates[i] || "",
          status: statuses[i] || "",
        })),
      });
    }

    return NextResponse.json({
      duplicateGroups: groups,
      totalGroups: groups.length,
    });
  } catch (err) {
    return handleError(err);
  }
}

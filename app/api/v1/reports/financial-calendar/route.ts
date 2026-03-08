import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  invoice,
  bill,
  recurringTemplate,
  budget,
  budgetPeriod,
  budgetLine,
} from "@/lib/db/schema";
import { eq, and, gte, lte, notInArray, isNull } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

function advanceDate(date: string, frequency: string): string {
  const d = new Date(date + "T00:00:00Z");
  switch (frequency) {
    case "weekly": d.setUTCDate(d.getUTCDate() + 7); break;
    case "fortnightly": d.setUTCDate(d.getUTCDate() + 14); break;
    case "monthly": d.setUTCMonth(d.getUTCMonth() + 1); break;
    case "quarterly": d.setUTCMonth(d.getUTCMonth() + 3); break;
    case "semi_annual": d.setUTCMonth(d.getUTCMonth() + 6); break;
    case "annual": d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  return d.toISOString().split("T")[0];
}

interface CalendarEvent {
  date: string;
  type: "invoice_due" | "bill_due" | "recurring_generation" | "budget_period_start";
  title: string;
  amount?: number;
  id?: string;
  status?: string;
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate") || new Date().toISOString().slice(0, 10);
    const endD = new Date(startDate);
    endD.setDate(endD.getDate() + 60);
    const endDate = url.searchParams.get("endDate") || endD.toISOString().slice(0, 10);

    const events: CalendarEvent[] = [];

    // Invoice due dates
    const invoices = await db.query.invoice.findMany({
      where: and(
        eq(invoice.organizationId, ctx.organizationId),
        notInArray(invoice.status, ["draft", "void", "paid"]),
        isNull(invoice.deletedAt),
        gte(invoice.dueDate, startDate),
        lte(invoice.dueDate, endDate)
      ),
      with: { contact: true },
    });

    for (const inv of invoices) {
      events.push({
        date: inv.dueDate,
        type: "invoice_due",
        title: `${inv.contact?.name || "Customer"} - ${inv.invoiceNumber}`,
        amount: inv.amountDue,
        id: inv.id,
        status: inv.status,
      });
    }

    // Bill due dates
    const bills = await db.query.bill.findMany({
      where: and(
        eq(bill.organizationId, ctx.organizationId),
        notInArray(bill.status, ["draft", "void", "paid"]),
        isNull(bill.deletedAt),
        gte(bill.dueDate, startDate),
        lte(bill.dueDate, endDate)
      ),
      with: { contact: true },
    });

    for (const b of bills) {
      events.push({
        date: b.dueDate,
        type: "bill_due",
        title: `${b.contact?.name || "Supplier"} - ${b.billNumber}`,
        amount: b.amountDue,
        id: b.id,
        status: b.status,
      });
    }

    // Recurring template generations
    const templates = await db.query.recurringTemplate.findMany({
      where: and(
        eq(recurringTemplate.organizationId, ctx.organizationId),
        eq(recurringTemplate.status, "active"),
        notDeleted(recurringTemplate.deletedAt)
      ),
      with: { contact: true, lines: true },
    });

    for (const t of templates) {
      let nextDate = t.nextRunDate;
      let occ = t.occurrencesGenerated;
      const lineTotal = t.lines.reduce((s, l) => s + Math.round((l.quantity / 100) * l.unitPrice), 0);

      for (let i = 0; i < 5; i++) {
        if (nextDate > endDate) break;
        if (t.endDate && nextDate > t.endDate) break;
        if (t.maxOccurrences && occ >= t.maxOccurrences) break;
        if (nextDate >= startDate) {
          events.push({
            date: nextDate,
            type: "recurring_generation",
            title: `${t.name} - ${t.contact?.name || ""}`,
            amount: lineTotal,
            id: t.id,
          });
        }
        occ++;
        nextDate = advanceDate(nextDate, t.frequency);
      }
    }

    // Budget period starts
    const budgets = await db.query.budget.findMany({
      where: and(
        eq(budget.organizationId, ctx.organizationId),
        eq(budget.isActive, true),
        isNull(budget.deletedAt)
      ),
      with: {
        lines: {
          with: {
            periods: true,
          },
        },
      },
    });

    for (const b of budgets) {
      for (const line of b.lines) {
        for (const period of line.periods) {
          if (period.startDate >= startDate && period.startDate <= endDate) {
            events.push({
              date: period.startDate,
              type: "budget_period_start",
              title: `${b.name} - ${period.label}`,
              amount: period.amount,
            });
          }
        }
      }
    }

    events.sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ startDate, endDate, events });
  } catch (err) {
    return handleError(err);
  }
}

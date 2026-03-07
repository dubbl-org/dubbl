import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  invoice,
  bill,
  recurringTemplate,
  recurringTemplateLine,
} from "@/lib/db/schema";
import { eq, and, gte, lte, notInArray } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

function advanceDate(date: string, frequency: string): string {
  const d = new Date(date + "T00:00:00Z");
  switch (frequency) {
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "fortnightly":
      d.setUTCDate(d.getUTCDate() + 14);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case "semi_annual":
      d.setUTCMonth(d.getUTCMonth() + 6);
      break;
    case "annual":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
  }
  return d.toISOString().split("T")[0];
}

interface ForecastEntry {
  date: string;
  type: "receivable" | "payable" | "recurring_invoice" | "recurring_bill";
  description: string;
  amount: number;
}

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const weeksAhead = Math.min(parseInt(url.searchParams.get("weeks") || "12"), 52);

    const today = new Date().toISOString().slice(0, 10);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + weeksAhead * 7);
    const endDateStr = endDate.toISOString().slice(0, 10);

    const entries: ForecastEntry[] = [];

    // 1. Outstanding invoices (expected inflows)
    const outstandingInvoices = await db.query.invoice.findMany({
      where: and(
        eq(invoice.organizationId, ctx.organizationId),
        notInArray(invoice.status, ["draft", "void", "paid"]),
        gte(invoice.dueDate, today),
        lte(invoice.dueDate, endDateStr)
      ),
      with: { contact: true },
    });

    for (const inv of outstandingInvoices) {
      entries.push({
        date: inv.dueDate,
        type: "receivable",
        description: `${inv.contact?.name || "Customer"} - ${inv.invoiceNumber}`,
        amount: inv.amountDue,
      });
    }

    // 2. Outstanding bills (expected outflows)
    const outstandingBills = await db.query.bill.findMany({
      where: and(
        eq(bill.organizationId, ctx.organizationId),
        notInArray(bill.status, ["draft", "void", "paid"]),
        gte(bill.dueDate, today),
        lte(bill.dueDate, endDateStr)
      ),
      with: { contact: true },
    });

    for (const b of outstandingBills) {
      entries.push({
        date: b.dueDate,
        type: "payable",
        description: `${b.contact?.name || "Supplier"} - ${b.billNumber}`,
        amount: -b.amountDue,
      });
    }

    // 3. Recurring templates (projected future generations)
    const templates = await db.query.recurringTemplate.findMany({
      where: and(
        eq(recurringTemplate.organizationId, ctx.organizationId),
        eq(recurringTemplate.status, "active"),
        notDeleted(recurringTemplate.deletedAt)
      ),
      with: { lines: true, contact: true },
    });

    for (const t of templates) {
      const lineTotal = t.lines.reduce(
        (s, l) => s + Math.round((l.quantity / 100) * l.unitPrice),
        0
      );
      let nextDate = t.nextRunDate;
      let occ = t.occurrencesGenerated;

      for (let i = 0; i < 10; i++) {
        if (nextDate > endDateStr) break;
        if (t.endDate && nextDate > t.endDate) break;
        if (t.maxOccurrences && occ >= t.maxOccurrences) break;
        if (nextDate >= today) {
          entries.push({
            date: nextDate,
            type: t.type === "invoice" ? "recurring_invoice" : "recurring_bill",
            description: `${t.name} - ${t.contact?.name || ""}`,
            amount: t.type === "invoice" ? lineTotal : -lineTotal,
          });
        }
        occ++;
        nextDate = advanceDate(nextDate, t.frequency);
      }
    }

    // Sort by date
    entries.sort((a, b) => a.date.localeCompare(b.date));

    // Build weekly buckets
    const weekMap = new Map<string, { inflows: number; outflows: number; entries: ForecastEntry[] }>();
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of current week (Sunday)

    for (let i = 0; i < weeksAhead; i++) {
      const ws = new Date(weekStart);
      ws.setDate(ws.getDate() + i * 7);
      const key = ws.toISOString().slice(0, 10);
      weekMap.set(key, { inflows: 0, outflows: 0, entries: [] });
    }

    for (const entry of entries) {
      const entryDate = new Date(entry.date);
      // Find which week bucket this falls into
      let bestWeek = "";
      for (const [weekKey] of weekMap) {
        if (entry.date >= weekKey) bestWeek = weekKey;
      }
      if (bestWeek && weekMap.has(bestWeek)) {
        const bucket = weekMap.get(bestWeek)!;
        if (entry.amount > 0) bucket.inflows += entry.amount;
        else bucket.outflows += Math.abs(entry.amount);
        bucket.entries.push(entry);
      }
    }

    const weeks = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekOf, data]) => ({
        weekOf,
        inflows: data.inflows,
        outflows: data.outflows,
        net: data.inflows - data.outflows,
        entryCount: data.entries.length,
      }));

    // Running balance
    let runningBalance = 0;
    const weeksWithBalance = weeks.map((w) => {
      runningBalance += w.net;
      return { ...w, cumulativeNet: runningBalance };
    });

    const totalInflows = entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
    const totalOutflows = entries.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);

    return NextResponse.json({
      forecastPeriod: { start: today, end: endDateStr, weeks: weeksAhead },
      totalInflows,
      totalOutflows,
      netForecast: totalInflows - totalOutflows,
      weeks: weeksWithBalance,
      entries,
    });
  } catch (err) {
    return handleError(err);
  }
}

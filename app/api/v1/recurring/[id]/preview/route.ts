import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recurringTemplate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const count = Math.min(parseInt(url.searchParams.get("count") || "5"), 12);

    const found = await db.query.recurringTemplate.findFirst({
      where: and(
        eq(recurringTemplate.id, id),
        eq(recurringTemplate.organizationId, ctx.organizationId),
        notDeleted(recurringTemplate.deletedAt)
      ),
      with: { lines: true, contact: true },
    });

    if (!found) return notFound("Recurring template");
    if (found.status !== "active") {
      return NextResponse.json({ upcoming: [], template: found });
    }

    const upcoming: { date: string; occurrence: number }[] = [];
    let nextDate = found.nextRunDate;
    let occ = found.occurrencesGenerated;

    for (let i = 0; i < count; i++) {
      if (found.endDate && nextDate > found.endDate) break;
      if (found.maxOccurrences && occ >= found.maxOccurrences) break;

      occ++;
      upcoming.push({ date: nextDate, occurrence: occ });
      nextDate = advanceDate(nextDate, found.frequency);
    }

    // Calculate total per generation
    const lineTotal = found.lines.reduce(
      (s, l) => s + Math.round((l.quantity / 100) * l.unitPrice),
      0
    );

    return NextResponse.json({
      template: {
        id: found.id,
        name: found.name,
        type: found.type,
        frequency: found.frequency,
        contactName: found.contact?.name,
        lineTotal,
      },
      upcoming,
    });
  } catch (err) {
    return handleError(err);
  }
}

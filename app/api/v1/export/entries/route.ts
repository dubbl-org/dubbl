import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntry } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { generateCSV, centsToDecimal } from "@/lib/import-export/csv-utils";

const COLUMNS = [
  "entryNumber", "date", "description", "reference",
  "lineAccountCode", "debit", "credit",
];

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const conditions = [
      eq(journalEntry.organizationId, ctx.organizationId),
      notDeleted(journalEntry.deletedAt),
    ];
    if (startDate) conditions.push(gte(journalEntry.date, startDate));
    if (endDate) conditions.push(lte(journalEntry.date, endDate));

    const entries = await db.query.journalEntry.findMany({
      where: and(...conditions),
      with: { lines: { with: { account: true } } },
    });

    const rows: Record<string, unknown>[] = [];
    for (const entry of entries) {
      if (entry.lines && entry.lines.length > 0) {
        for (const line of entry.lines) {
          rows.push({
            entryNumber: entry.entryNumber,
            date: entry.date,
            description: entry.description,
            reference: entry.reference || "",
            lineAccountCode: line.account?.code || "",
            debit: line.debitAmount > 0 ? centsToDecimal(line.debitAmount) : "",
            credit: line.creditAmount > 0 ? centsToDecimal(line.creditAmount) : "",
          });
        }
      }
    }

    const csv = generateCSV(rows, COLUMNS);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=journal-entries.csv",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

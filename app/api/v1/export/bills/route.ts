import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bill } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { generateCSV, centsToDecimal } from "@/lib/import-export/csv-utils";

const COLUMNS = [
  "billNumber", "contactName", "date", "dueDate", "status",
  "lineDescription", "lineQty", "lineUnitPrice", "lineAmount", "lineAccountCode",
];

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const conditions = [
      eq(bill.organizationId, ctx.organizationId),
      notDeleted(bill.deletedAt),
    ];
    if (startDate) conditions.push(gte(bill.issueDate, startDate));
    if (endDate) conditions.push(lte(bill.issueDate, endDate));

    const bills = await db.query.bill.findMany({
      where: and(...conditions),
      with: { contact: true, lines: true },
    });

    const rows: Record<string, unknown>[] = [];
    for (const b of bills) {
      const contactName = b.contact?.name || "";
      if (b.lines && b.lines.length > 0) {
        for (const line of b.lines) {
          rows.push({
            billNumber: b.billNumber,
            contactName,
            date: b.issueDate,
            dueDate: b.dueDate,
            status: b.status,
            lineDescription: line.description,
            lineQty: centsToDecimal(line.quantity),
            lineUnitPrice: centsToDecimal(line.unitPrice),
            lineAmount: centsToDecimal(line.amount),
            lineAccountCode: line.accountId || "",
          });
        }
      } else {
        rows.push({
          billNumber: b.billNumber,
          contactName,
          date: b.issueDate,
          dueDate: b.dueDate,
          status: b.status,
          lineDescription: "",
          lineQty: "",
          lineUnitPrice: "",
          lineAmount: centsToDecimal(b.total),
          lineAccountCode: "",
        });
      }
    }

    const csv = generateCSV(rows, COLUMNS);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=bills.csv",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

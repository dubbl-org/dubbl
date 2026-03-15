import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invoice } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { generateCSV, centsToDecimal } from "@/lib/import-export/csv-utils";

const COLUMNS = [
  "invoiceNumber", "contactName", "date", "dueDate", "status",
  "lineDescription", "lineQty", "lineUnitPrice", "lineAmount", "lineAccountCode",
];

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const conditions = [
      eq(invoice.organizationId, ctx.organizationId),
      notDeleted(invoice.deletedAt),
    ];
    if (startDate) conditions.push(gte(invoice.issueDate, startDate));
    if (endDate) conditions.push(lte(invoice.issueDate, endDate));

    const invoices = await db.query.invoice.findMany({
      where: and(...conditions),
      with: { contact: true, lines: true },
    });

    const rows: Record<string, unknown>[] = [];
    for (const inv of invoices) {
      const contactName = inv.contact?.name || "";
      if (inv.lines && inv.lines.length > 0) {
        for (const line of inv.lines) {
          rows.push({
            invoiceNumber: inv.invoiceNumber,
            contactName,
            date: inv.issueDate,
            dueDate: inv.dueDate,
            status: inv.status,
            lineDescription: line.description,
            lineQty: centsToDecimal(line.quantity),
            lineUnitPrice: centsToDecimal(line.unitPrice),
            lineAmount: centsToDecimal(line.amount),
            lineAccountCode: line.accountId || "",
          });
        }
      } else {
        rows.push({
          invoiceNumber: inv.invoiceNumber,
          contactName,
          date: inv.issueDate,
          dueDate: inv.dueDate,
          status: inv.status,
          lineDescription: "",
          lineQty: "",
          lineUnitPrice: "",
          lineAmount: centsToDecimal(inv.total),
          lineAccountCode: "",
        });
      }
    }

    const csv = generateCSV(rows, COLUMNS);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=invoices.csv",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

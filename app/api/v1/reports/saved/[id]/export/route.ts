import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savedReport, invoice, contact, inventoryItem } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { notFound, handleError } from "@/lib/api/response";
import type { ReportConfig } from "@/lib/db/schema/reports";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const report = await db.query.savedReport.findFirst({
      where: and(
        eq(savedReport.id, id),
        eq(savedReport.organizationId, ctx.organizationId),
        notDeleted(savedReport.deletedAt)
      ),
    });

    if (!report) return notFound("Report");

    const config = report.config as ReportConfig;
    let rows: Record<string, unknown>[] = [];

    // Fetch data based on data source
    switch (config.dataSource) {
      case "invoices": {
        const all = await db.query.invoice.findMany({
          where: and(
            eq(invoice.organizationId, ctx.organizationId),
            notDeleted(invoice.deletedAt)
          ),
          with: { contact: true },
          orderBy: desc(invoice.createdAt),
        });
        rows = all.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          contactName: inv.contact?.name || "-",
          status: inv.status,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          total: inv.total,
          amountDue: inv.amountDue,
        }));
        break;
      }
      case "contacts": {
        const all = await db.query.contact.findMany({
          where: and(
            eq(contact.organizationId, ctx.organizationId),
            notDeleted(contact.deletedAt)
          ),
        });
        rows = all.map((c) => ({
          name: c.name,
          email: c.email,
          type: c.type,
          phone: c.phone,
        }));
        break;
      }
      case "inventory": {
        const all = await db.query.inventoryItem.findMany({
          where: and(
            eq(inventoryItem.organizationId, ctx.organizationId),
            notDeleted(inventoryItem.deletedAt)
          ),
        });
        rows = all.map((i) => ({
          code: i.code,
          name: i.name,
          category: i.category,
          quantityOnHand: i.quantityOnHand,
          salePrice: i.salePrice,
        }));
        break;
      }
    }

    // Select columns
    const columns = config.columns;
    const projected = rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const col of columns) {
        out[col] = r[col] ?? "";
      }
      return out;
    });

    // Generate CSV
    const header = columns.join(",");
    const csvRows = projected.map((r) =>
      columns.map((c) => {
        const val = String(r[c] ?? "");
        return val.includes(",") ? `"${val}"` : val;
      }).join(",")
    );
    const csv = [header, ...csvRows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${report.name.replace(/[^a-zA-Z0-9]/g, "_")}.csv"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

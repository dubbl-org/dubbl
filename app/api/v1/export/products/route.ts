import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { generateCSV, centsToDecimal } from "@/lib/import-export/csv-utils";

const COLUMNS = ["name", "sku", "description", "unitPrice", "costPrice", "quantityOnHand"];

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const products = await db.query.inventoryItem.findMany({
      where: and(
        eq(inventoryItem.organizationId, ctx.organizationId),
        notDeleted(inventoryItem.deletedAt),
      ),
    });

    const rows = products.map(p => ({
      name: p.name,
      sku: p.sku || "",
      description: p.description || "",
      unitPrice: centsToDecimal(p.salePrice),
      costPrice: centsToDecimal(p.purchasePrice),
      quantityOnHand: p.quantityOnHand,
    }));

    const csv = generateCSV(rows, COLUMNS);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=products.csv",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryItem } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { notDeleted } from "@/lib/db/soft-delete";

interface CsvRow {
  code?: string;
  name?: string;
  description?: string;
  category?: string;
  sku?: string;
  purchasePrice?: string;
  salePrice?: string;
  quantityOnHand?: string;
  reorderPoint?: string;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = headerLine.split(",").map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());

  // Normalize header names
  const headerMap: Record<string, string> = {};
  for (const h of headers) {
    if (h.includes("code") || h === "item_code" || h === "itemcode") headerMap[h] = "code";
    else if (h === "name" || h === "item_name" || h === "itemname" || h === "product") headerMap[h] = "name";
    else if (h.includes("description") || h === "desc") headerMap[h] = "description";
    else if (h.includes("category") || h === "cat") headerMap[h] = "category";
    else if (h === "sku" || h === "barcode") headerMap[h] = "sku";
    else if (h.includes("purchase") || h === "cost" || h === "cost_price" || h === "costprice") headerMap[h] = "purchasePrice";
    else if (h.includes("sale") || h === "price" || h === "sell_price" || h === "sellprice") headerMap[h] = "salePrice";
    else if (h.includes("quantity") || h === "qty" || h === "stock" || h === "on_hand") headerMap[h] = "quantityOnHand";
    else if (h.includes("reorder") || h === "min_stock") headerMap[h] = "reorderPoint";
    else headerMap[h] = h;
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const mapped = headerMap[h];
      if (mapped && values[idx] !== undefined) {
        row[mapped] = values[idx].replace(/^"|"$/g, "").trim();
      }
    });
    rows.push(row as CsvRow);
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:inventory");

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCsv(text);

    if (rows.length === 0) {
      return NextResponse.json({ error: "No data rows found in CSV" }, { status: 400 });
    }

    let created = 0;
    let updated = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.code || !row.name) {
        errors.push({ row: i + 2, message: "Missing required field: code or name" });
        continue;
      }

      try {
        const purchasePrice = row.purchasePrice ? Math.round(parseFloat(row.purchasePrice) * 100) : 0;
        const salePrice = row.salePrice ? Math.round(parseFloat(row.salePrice) * 100) : 0;
        const quantityOnHand = row.quantityOnHand ? parseInt(row.quantityOnHand) : 0;
        const reorderPoint = row.reorderPoint ? parseInt(row.reorderPoint) : 0;

        // Check if item already exists by code
        const existing = await db.query.inventoryItem.findFirst({
          where: and(
            eq(inventoryItem.organizationId, ctx.organizationId),
            eq(inventoryItem.code, row.code),
            notDeleted(inventoryItem.deletedAt)
          ),
        });

        if (existing) {
          await db
            .update(inventoryItem)
            .set({
              name: row.name,
              description: row.description || existing.description,
              category: row.category || existing.category,
              sku: row.sku || existing.sku,
              purchasePrice: purchasePrice || existing.purchasePrice,
              salePrice: salePrice || existing.salePrice,
              quantityOnHand: quantityOnHand || existing.quantityOnHand,
              reorderPoint: reorderPoint || existing.reorderPoint,
              updatedAt: new Date(),
            })
            .where(eq(inventoryItem.id, existing.id));
          updated++;
        } else {
          await db.insert(inventoryItem).values({
            organizationId: ctx.organizationId,
            code: row.code,
            name: row.name,
            description: row.description || null,
            category: row.category || null,
            sku: row.sku || null,
            purchasePrice,
            salePrice,
            quantityOnHand,
            reorderPoint,
          });
          created++;
        }
      } catch (err) {
        errors.push({
          row: i + 2,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({ created, updated, errors, total: rows.length });
  } catch (err) {
    return handleError(err);
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chartAccount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { generateCSV } from "@/lib/import-export/csv-utils";

const COLUMNS = ["code", "name", "type", "subType", "description", "isActive"];

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    const accounts = await db.query.chartAccount.findMany({
      where: and(
        eq(chartAccount.organizationId, ctx.organizationId),
        notDeleted(chartAccount.deletedAt),
      ),
      columns: { code: true, name: true, type: true, subType: true, description: true, isActive: true },
    });

    const rows = accounts.map(a => ({
      code: a.code,
      name: a.name,
      type: a.type,
      subType: a.subType || "",
      description: a.description || "",
      isActive: a.isActive ? "true" : "false",
    }));

    const csv = generateCSV(rows, COLUMNS);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=accounts.csv",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

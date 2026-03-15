import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { preProcessAccounts } from "@/lib/import-export/pre-process";
import type { SourceSystem } from "@/lib/import-export/types";
import { z } from "zod";

const rowSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  subType: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    await getAuthContext(request);
    const body = await request.json();
    const source = (body.source || "custom") as SourceSystem;
    const rawRows = z.array(z.record(z.string(), z.unknown())).parse(body.rows || []);
    const rows = preProcessAccounts(rawRows, source);

    const preview = rows.map((row, i) => {
      const result = rowSchema.safeParse(row);
      return {
        row: i + 1,
        data: row,
        valid: result.success,
        errors: result.success ? [] : result.error.issues.map(e => e.message),
      };
    });

    return NextResponse.json({ preview, validCount: preview.filter(p => p.valid).length, totalCount: rows.length });
  } catch (err) {
    return handleError(err);
  }
}

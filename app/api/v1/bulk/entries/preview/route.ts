import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { z } from "zod";

const rowSchema = z.object({
  date: z.string().min(1),
  description: z.string().min(1),
  lineAccountCode: z.string().min(1),
  debit: z.coerce.number().optional(),
  credit: z.coerce.number().optional(),
  reference: z.string().optional(),
  entryNumber: z.coerce.string().optional(),
});

export async function POST(request: Request) {
  try {
    await getAuthContext(request);
    const body = await request.json();
    const rows = z.array(z.record(z.string(), z.unknown())).parse(body.rows || []);

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

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { z } from "zod";

const rowSchema = z.object({
  name: z.string().min(1),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  type: z.enum(["customer", "supplier", "both"]).default("customer"),
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

    const validCount = preview.filter(p => p.valid).length;
    return NextResponse.json({ preview, validCount, totalCount: rows.length });
  } catch (err) {
    return handleError(err);
  }
}

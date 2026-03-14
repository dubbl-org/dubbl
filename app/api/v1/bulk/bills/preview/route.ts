import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { z } from "zod";

const rowSchema = z.object({
  billNumber: z.string().min(1),
  contactName: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  lineDescription: z.string().min(1),
  lineQuantity: z.coerce.number().optional().default(1),
  lineUnitPrice: z.coerce.number().optional().default(0),
  lineAmount: z.coerce.number().optional(),
  lineAccountCode: z.string().optional(),
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

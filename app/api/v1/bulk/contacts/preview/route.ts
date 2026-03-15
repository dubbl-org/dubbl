import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { preProcessContacts } from "@/lib/import-export/pre-process";
import { z } from "zod";

const rowSchema = z.object({
  name: z.string().min(1),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  type: z.enum(["customer", "supplier", "both"]).default("customer"),
  taxNumber: z.string().nullable().optional(),
  billingLine1: z.string().nullable().optional(),
  billingCity: z.string().nullable().optional(),
  billingState: z.string().nullable().optional(),
  billingPostalCode: z.string().nullable().optional(),
  billingCountry: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    await getAuthContext(request);
    const body = await request.json();
    const rawRows = z.array(z.record(z.string(), z.unknown())).parse(body.rows || []);
    const rows = preProcessContacts(rawRows);

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

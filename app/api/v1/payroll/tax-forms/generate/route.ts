import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { logAudit } from "@/lib/api/audit";
import { generateTaxForms } from "@/lib/api/tax-form-builder";
import { z } from "zod";

const generateSchema = z.object({
  taxYear: z.number().int().min(2020).max(2099),
  formType: z.enum(["1099_nec", "1099_misc", "w2"]),
});

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");
    const body = await request.json();
    const parsed = generateSchema.parse(body);

    // Box calculations live in lib/api/tax-form-builder.ts, shared with the MCP tool
    const result = await generateTaxForms(ctx, parsed);

    logAudit({ ctx, action: "generate", entityType: "taxFormGeneration", entityId: result.generation.id, request });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

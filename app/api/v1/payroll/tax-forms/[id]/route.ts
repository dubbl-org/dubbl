import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { getTaxFormForOrg } from "@/lib/api/tax-form-builder";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");
    const { id } = await params;
    // Scoped to the org through the form's generation batch
    const form = await getTaxFormForOrg(ctx, id);
    return NextResponse.json(form);
  } catch (err) {
    return handleError(err);
  }
}

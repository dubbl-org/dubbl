import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { expenseStatusCounts } from "@/lib/server/data/expenses";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "view:data");
    return NextResponse.json(await expenseStatusCounts(ctx.organizationId));
  } catch (err) {
    return handleError(err);
  }
}

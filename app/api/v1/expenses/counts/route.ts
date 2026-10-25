import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { expenseStatusCounts } from "@/lib/server/data/expenses";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    return NextResponse.json(await expenseStatusCounts(ctx.organizationId));
  } catch (err) {
    return handleError(err);
  }
}

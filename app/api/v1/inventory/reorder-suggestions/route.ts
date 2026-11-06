import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { getReorderSuggestions } from "@/lib/api/inventory-reports";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const data = await getReorderSuggestions(ctx.organizationId);
    return NextResponse.json({ data });
  } catch (err) {
    return handleError(err);
  }
}

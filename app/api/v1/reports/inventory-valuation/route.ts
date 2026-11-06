import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError } from "@/lib/api/response";
import { getInventoryValuation } from "@/lib/api/inventory-reports";

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    // Each item is valued by its own costing method (average or FIFO), at its
    // book value. The legacy `method` param is ignored.
    const result = await getInventoryValuation(ctx.organizationId, {
      sortBy: url.searchParams.get("sortBy") || "name",
      sortOrder: url.searchParams.get("sortOrder") === "desc" ? "desc" : "asc",
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}

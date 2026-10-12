import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, validationError } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { listContactBalances } from "@/lib/api/contact-balances";

/**
 * GET /api/v1/contacts/balances?side=customer|supplier
 *
 * Customers (side=customer, the default) with their receivables, or suppliers
 * (side=supplier) with their payables: outstanding, overdue, ageing buckets,
 * totals this/last year, last document and payment dates, average days to pay.
 * All amounts are integer cents. Optional: search, open=1 (only contacts with
 * an unpaid balance), page, limit.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const side = url.searchParams.get("side") || "customer";
    if (side !== "customer" && side !== "supplier") {
      return validationError("side must be 'customer' or 'supplier'");
    }
    const { page, limit, offset } = parsePagination(url);
    const open = url.searchParams.get("open");

    const { rows, total } = await listContactBalances(ctx.organizationId, side, {
      search: url.searchParams.get("search"),
      openOnly: open === "1" || open === "true",
      limit,
      offset,
    });

    return NextResponse.json(paginatedResponse(rows, total, page, limit));
  } catch (err) {
    return handleError(err);
  }
}

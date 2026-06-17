import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound, error } from "@/lib/api/response";
import {
  buildSupplierStatement,
  NotASupplierError,
} from "@/lib/api/supplier-statement";

/**
 * Supplier (AP-oriented) statement for a contact over a date range.
 *
 * Mirrors the AR contacts/[id]/statement pattern, but only the supplier side:
 * bills (what we owe — increases balance), debit notes (reduce what we owe),
 * and payments made (reduce what we owe). Debit-note carrier payments are
 * excluded to avoid double counting. All amounts are integer cents.
 *
 * Query params: startDate, endDate (YYYY-MM-DD; default last 12 months).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;

    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const statement = await buildSupplierStatement(
      ctx.organizationId,
      id,
      startDate,
      endDate
    );

    if (!statement) return notFound("Contact");

    return NextResponse.json(statement);
  } catch (err) {
    if (err instanceof NotASupplierError) {
      return error(err.message, 400);
    }
    return handleError(err);
  }
}

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";
import { buildContactStatement } from "@/lib/api/contact-statement";

/**
 * Account statement for a contact. Query params: startDate, endDate
 * (YYYY-MM-DD; default the last 12 months). All amounts are integer cents.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;
    const url = new URL(request.url);

    const statement = await buildContactStatement(
      ctx.organizationId,
      id,
      url.searchParams.get("startDate"),
      url.searchParams.get("endDate")
    );
    if (!statement) return notFound("Contact");

    return NextResponse.json(statement);
  } catch (err) {
    return handleError(err);
  }
}

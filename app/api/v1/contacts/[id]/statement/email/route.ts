import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, error } from "@/lib/api/response";
import { emailContactStatement, StatementError } from "@/lib/api/contact-statement";

/**
 * Email a contact their statement. Body: { startDate?, endDate? }
 * (YYYY-MM-DD; default the last 12 months). Needs the workspace's SMTP settings.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { startDate, endDate } = (body ?? {}) as { startDate?: string; endDate?: string };

    const result = await emailContactStatement(ctx.organizationId, id, startDate, endDate);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof StatementError) return error(err.message, err.status);
    return handleError(err);
  }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documentEmailLog } from "@/lib/db/schema";
import { eq, and, desc, ilike, or, count } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, ok } from "@/lib/api/response";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { describeRecords } from "@/lib/documents/records";

/**
 * With `documentType` + `documentId`: the email history of one document.
 * Without them: every document email the workspace has sent (invoices, quotes,
 * credit notes, purchase orders, supplier credits, remittance advice), newest
 * first and paginated, each with the document it was about. Optional filters:
 * `documentType`, `status` (sent/failed) and `search` (recipient or subject).
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const { searchParams } = url;
    const documentType = searchParams.get("documentType");
    const documentId = searchParams.get("documentId");

    if (documentType && documentId) {
      const emails = await db.query.documentEmailLog.findMany({
        where: and(
          eq(documentEmailLog.organizationId, ctx.organizationId),
          eq(documentEmailLog.documentType, documentType),
          eq(documentEmailLog.documentId, documentId)
        ),
        orderBy: desc(documentEmailLog.sentAt),
      });

      return NextResponse.json({ emails });
    }

    const { page, limit, offset } = parsePagination(url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const conditions = [eq(documentEmailLog.organizationId, ctx.organizationId)];
    if (documentType) conditions.push(eq(documentEmailLog.documentType, documentType));
    if (status) conditions.push(eq(documentEmailLog.status, status));
    if (search) {
      const q = `%${search}%`;
      conditions.push(or(ilike(documentEmailLog.recipientEmail, q), ilike(documentEmailLog.subject, q))!);
    }
    const where = and(...conditions);

    const [{ total }] = await db.select({ total: count() }).from(documentEmailLog).where(where);
    const rows = await db.query.documentEmailLog.findMany({
      where,
      orderBy: desc(documentEmailLog.sentAt),
      limit,
      offset,
      with: { sentByUser: { columns: { id: true, name: true, email: true } } },
    });

    const records = await describeRecords(
      ctx.organizationId,
      rows.map((r) => ({ type: r.documentType, id: r.documentId }))
    );
    const data = rows.map((r) => ({ ...r, document: records.get(`${r.documentType}:${r.documentId}`) ?? null }));

    return ok(paginatedResponse(data, total, page, limit));
  } catch (err) {
    return handleError(err);
  }
}

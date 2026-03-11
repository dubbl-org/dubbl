import { db } from "@/lib/db";
import { portalAccessToken, invoice, portalActivityLog } from "@/lib/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { ok, notFound, error, handleError } from "@/lib/api/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const access = await db.query.portalAccessToken.findFirst({
      where: and(
        eq(portalAccessToken.token, token),
        isNull(portalAccessToken.revokedAt)
      ),
    });

    if (!access) return notFound("Portal access");
    if (access.expiresAt && access.expiresAt < new Date()) {
      return error("Portal link has expired", 410);
    }

    // Log activity
    await db.insert(portalActivityLog).values({
      tokenId: access.id,
      action: "view_invoices",
      ipAddress: request.headers.get("x-forwarded-for") || null,
    });

    const invoices = await db.query.invoice.findMany({
      where: and(
        eq(invoice.organizationId, access.organizationId),
        eq(invoice.contactId, access.contactId),
        notDeleted(invoice.deletedAt)
      ),
      orderBy: desc(invoice.createdAt),
    });

    return ok({
      data: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        status: inv.status,
        total: inv.total,
        amountDue: inv.amountDue,
        currencyCode: inv.currencyCode,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

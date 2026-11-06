import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { portalAccessToken } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { notFound, error, handleError } from "@/lib/api/response";
import { renderContactStatementPdf } from "@/lib/api/contact-statement";

/**
 * GET /api/portal/[token]/statements/pdf
 *
 * The portal customer's own statement as a PDF. Same ledger as the in-app
 * statement (drafts, unapproved and voided documents excluded). Optional
 * startDate/endDate (YYYY-MM-DD), default the last 12 months.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const url = new URL(request.url);

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

    const file = await renderContactStatementPdf(
      access.organizationId,
      access.contactId,
      url.searchParams.get("startDate"),
      url.searchParams.get("endDate")
    );
    if (!file) return notFound("Contact");

    return new NextResponse(new Uint8Array(file.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

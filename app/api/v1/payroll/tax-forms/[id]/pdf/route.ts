import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { requireRole } from "@/lib/api/require-role";
import { handleError } from "@/lib/api/response";
import { getTaxFormForOrg } from "@/lib/api/tax-form-builder";
import { renderTaxFormPdf, taxFormTitle } from "@/lib/tax-forms/pdf";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    requireRole(ctx, "manage:payroll");
    const { id } = await params;
    const form = await getTaxFormForOrg(ctx, id);

    const org = await db.query.organization.findFirst({ where: eq(organization.id, ctx.organizationId) });
    const address = [org?.addressStreet, org?.addressCity, org?.addressState, org?.addressPostalCode]
      .filter(Boolean)
      .join(", ");

    const pdf = await renderTaxFormPdf({
      formType: form.formType,
      taxYear: form.taxYear,
      recipientName: form.recipientName,
      recipientTaxId: form.recipientTaxId,
      formData: form.formData ?? null,
      employer: { name: org?.name ?? "", taxId: org?.taxId ?? null, address: address || null },
    });

    const safeName = form.recipientName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "recipient";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${taxFormTitle(form.formType)}-${form.taxYear}-${safeName}.pdf"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

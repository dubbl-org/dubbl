import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxForm } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { handleError, notFound } from "@/lib/api/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getAuthContext(request);
    const { id } = await params;
    const form = await db.query.taxForm.findFirst({ where: eq(taxForm.id, id) });
    if (!form) return notFound("Tax form");

    return NextResponse.json({
      formType: form.formType,
      taxYear: form.taxYear,
      recipientName: form.recipientName,
      recipientTaxId: form.recipientTaxId,
      formData: form.formData,
      note: "PDF generation requires pdf-lib package. Form data returned as JSON.",
    });
  } catch (err) {
    return handleError(err);
  }
}

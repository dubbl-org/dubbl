import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documentTemplate } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext } from "@/lib/api/auth-context";
import { notDeleted } from "@/lib/db/soft-delete";
import { notFound, handleError } from "@/lib/api/response";
import { generateInvoiceHtml } from "@/lib/documents/pdf-generator";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);

    const template = await db.query.documentTemplate.findFirst({
      where: and(
        eq(documentTemplate.id, id),
        eq(documentTemplate.organizationId, ctx.organizationId),
        notDeleted(documentTemplate.deletedAt)
      ),
    });

    if (!template) return notFound("Template");

    const { organization } = await import("@/lib/db/schema");
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, ctx.organizationId),
    });

    const sampleData = {
      invoiceNumber: "INV-0001",
      issueDate: "2026-03-10",
      dueDate: "2026-04-09",
      status: "draft",
      contactName: "Sample Customer",
      contactEmail: "customer@example.com",
      lines: [
        { description: "Web Development Services", quantity: 100, unitPrice: 15000, taxAmount: 1500, amount: 15000 },
        { description: "UI/UX Design", quantity: 200, unitPrice: 7500, taxAmount: 1500, amount: 15000 },
      ],
      subtotal: 30000,
      taxTotal: 3000,
      total: 33000,
      currencyCode: "USD",
      reference: "PO-123",
      notes: null,
    };

    const html = generateInvoiceHtml(
      sampleData,
      {
        name: org?.name || "Your Company",
        address: [org?.addressStreet, org?.addressCity, org?.addressState].filter(Boolean).join(", ") || null,
        taxId: org?.taxId || null,
      },
      template
    );

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return handleError(err);
  }
}

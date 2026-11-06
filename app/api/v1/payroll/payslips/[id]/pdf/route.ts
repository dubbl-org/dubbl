import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { member } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthContext, type AuthContext } from "@/lib/api/auth-context";
import { hasPermission } from "@/lib/plans";
import { requireRole } from "@/lib/api/require-role";
import { notFound, handleError } from "@/lib/api/response";
import { getDefaultTemplate, loadOrgInfo } from "@/lib/documents/templates";
import { loadPayslipPdfData } from "@/lib/documents/payslip-pdf";

// Same rule as GET /payroll/payslips/{id}: payroll managers get any payslip in
// the org, everyone else only their own (others look like "not found").
async function canView(ctx: AuthContext, employeeMemberId: string | null): Promise<boolean> {
  requireRole(ctx, "view:payslips");
  if (hasPermission(ctx.permissions ?? ctx.role, "manage:payroll")) return true;
  const me = await db.query.member.findFirst({
    where: and(eq(member.userId, ctx.userId), eq(member.organizationId, ctx.organizationId)),
    columns: { id: true },
  });
  return !!me && !!employeeMemberId && me.id === employeeMemberId;
}

// Payslip PDF. Uses the organization's default "payslip" template.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await getAuthContext(request);
    const url = new URL(request.url);
    const format = url.searchParams.get("format");

    const loaded = await loadPayslipPdfData(id, ctx.organizationId);
    if (!loaded) return notFound("Payslip");
    if (!(await canView(ctx, loaded.employeeMemberId))) return notFound("Payslip");

    const template = (await getDefaultTemplate(ctx.organizationId, "payslip")) || {};
    const orgInfo = await loadOrgInfo(ctx.organizationId);

    if (format === "pdf") {
      const { renderPayslipPdf } = await import("@/lib/documents/pdf-renderer");
      const pdfBuffer = await renderPayslipPdf(loaded.slip, orgInfo, template);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${loaded.fileName}"`,
        },
      });
    }

    const { generatePayslipHtml } = await import("@/lib/documents/pdf-generator");
    return new NextResponse(generatePayslipHtml(loaded.slip, orgInfo, template), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return handleError(err);
  }
}

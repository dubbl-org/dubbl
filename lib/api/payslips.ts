/**
 * Payslips for finished payroll runs: generating them (once per pay item),
 * building the PDF, and emailing them to employees. Shared by the REST routes
 * and the MCP payroll tools. All amounts are integer cents.
 */
import { db } from "@/lib/db";
import {
  organization,
  payrollItem,
  payrollRun,
  payslip,
} from "@/lib/db/schema";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";
import { ApprovalError } from "@/lib/approvals/errors";
import type { AuthContext } from "@/lib/api/auth-context";

/** One named deduction stored on payslip.deductionsBreakdown. */
export interface PayslipBreakdownLine {
  name: string;
  amount: number; // cents
  category: "pre_tax" | "post_tax";
}

const TAX_KIND_LABELS: Record<string, string> = {
  income_tax: "Income tax",
  social_security: "Social Security",
  medicare: "Medicare",
  additional_medicare: "Additional Medicare",
};

/** "Federal income tax", "State income tax (CA)", "Social Security", ... */
export function taxLineLabel(line: { taxKind: string; jurisdictionLevel: string; jurisdiction: string | null }): string {
  const base = TAX_KIND_LABELS[line.taxKind] ?? line.taxKind.replace(/_/g, " ");
  if (line.taxKind !== "income_tax") return base;
  const level = line.jurisdictionLevel === "federal" ? "Federal" : line.jurisdictionLevel === "state" ? "State" : "Local";
  return `${level} income tax${line.jurisdiction ? ` (${line.jurisdiction})` : ""}`;
}

/** The deductions withheld on a pay item (taxes are on payrollItemTaxBreakdown). */
async function loadItemDeductions(itemId: string): Promise<PayslipBreakdownLine[]> {
  const item = await db.query.payrollItem.findFirst({
    where: eq(payrollItem.id, itemId),
    with: { deductionBreakdowns: { with: { deductionType: { columns: { name: true } } } } },
  });
  if (!item) return [];
  return item.deductionBreakdowns.map((d) => ({
    name: d.deductionType?.name ?? "Deduction",
    amount: d.amount,
    category: d.category,
  }));
}

/**
 * Create a payslip for every pay item in a finished run that doesn't have one
 * yet (so clicking Generate twice doesn't make duplicates). Each payslip
 * carries the itemised taxes and deductions and the employee's totals for the
 * calendar year up to this run. Returns how many were created and how many
 * already existed.
 */
export async function generateRunPayslips(organizationId: string, runId: string) {
  const run = await db.query.payrollRun.findFirst({
    where: and(
      eq(payrollRun.id, runId),
      eq(payrollRun.organizationId, organizationId),
      notDeleted(payrollRun.deletedAt)
    ),
    with: { items: true },
  });
  if (!run) throw new ApprovalError("Payroll run not found", 404);
  if (run.status !== "completed") throw new ApprovalError("Can only generate payslips for completed runs");

  const existing = await db.query.payslip.findMany({
    where: eq(payslip.payrollRunId, run.id),
    columns: { payrollItemId: true },
  });
  const done = new Set(existing.map((p) => p.payrollItemId));
  const yearStart = `${run.payPeriodEnd.slice(0, 4)}-01-01`;

  const rows: (typeof payslip.$inferInsert)[] = [];
  for (const item of run.items) {
    if (done.has(item.id)) continue;
    // Year to date: finished runs this calendar year up to this one.
    const [ytd] = await db
      .select({
        ytdGross: sql<number>`coalesce(sum(${payrollItem.grossAmount}), 0)`.mapWith(Number),
        ytdNet: sql<number>`coalesce(sum(${payrollItem.netAmount}), 0)`.mapWith(Number),
        ytdTax: sql<number>`coalesce(sum(${payrollItem.taxAmount}), 0)`.mapWith(Number),
      })
      .from(payrollItem)
      .innerJoin(payrollRun, eq(payrollItem.payrollRunId, payrollRun.id))
      .where(and(
        eq(payrollItem.employeeId, item.employeeId),
        eq(payrollRun.status, "completed"),
        eq(payrollRun.organizationId, organizationId),
        isNull(payrollRun.deletedAt),
        gte(payrollRun.payPeriodEnd, yearStart),
        lte(payrollRun.payPeriodEnd, run.payPeriodEnd)
      ));

    rows.push({
      payrollRunId: run.id,
      employeeId: item.employeeId,
      payrollItemId: item.id,
      grossAmount: item.grossAmount,
      netAmount: item.netAmount,
      taxAmount: item.taxAmount,
      deductionsBreakdown: await loadItemDeductions(item.id),
      ytdGross: ytd?.ytdGross || 0,
      ytdNet: ytd?.ytdNet || 0,
      ytdTax: ytd?.ytdTax || 0,
    });
  }

  if (rows.length > 0) await db.insert(payslip).values(rows);
  return { count: rows.length, alreadyGenerated: done.size };
}

/** Load a payslip, scoped to the org, with what the PDF needs. */
export async function loadOrgPayslip(organizationId: string, payslipId: string) {
  const ps = await db.query.payslip.findFirst({
    where: eq(payslip.id, payslipId),
    with: { payrollRun: true, employee: true, payrollItem: true },
  });
  if (!ps || ps.payrollRun?.organizationId !== organizationId) return null;
  return ps;
}

/** Render a payslip as a PDF with the org's default payslip template. */
export async function renderPayslipPdfFor(organizationId: string, payslipId: string) {
  const { loadPayslipPdfData } = await import("@/lib/documents/payslip-pdf");
  const { getDefaultTemplate, loadOrgInfo } = await import("@/lib/documents/templates");
  const { renderPayslipPdf } = await import("@/lib/documents/pdf-renderer");
  const loaded = await loadPayslipPdfData(payslipId, organizationId);
  if (!loaded) return null;
  const template = (await getDefaultTemplate(organizationId, "payslip")) || {};
  const pdf = await renderPayslipPdf(loaded.slip, await loadOrgInfo(organizationId), template);
  return { pdf, fileName: loaded.fileName };
}

/**
 * Email each payslip in a run (with the PDF attached) to employees who have
 * an email address and haven't been sent theirs yet. Marks them as sent.
 */
export async function emailRunPayslips(ctx: AuthContext, runId: string) {
  const run = await db.query.payrollRun.findFirst({
    where: and(
      eq(payrollRun.id, runId),
      eq(payrollRun.organizationId, ctx.organizationId),
      notDeleted(payrollRun.deletedAt)
    ),
  });
  if (!run) throw new ApprovalError("Payroll run not found", 404);

  const slips = await db.query.payslip.findMany({ where: eq(payslip.payrollRunId, run.id), columns: { id: true, status: true } });
  if (slips.length === 0) throw new ApprovalError("Generate the payslips first");

  const org = await db.query.organization.findFirst({ where: eq(organization.id, ctx.organizationId) });
  const { sendDocumentEmail } = await import("@/lib/email/document-sender");

  let sent = 0;
  let skippedNoEmail = 0;
  let alreadySent = 0;
  const failed: string[] = [];
  for (const s of slips) {
    if (s.status !== "generated") {
      alreadySent++;
      continue;
    }
    const ps = await loadOrgPayslip(ctx.organizationId, s.id);
    if (!ps) continue;
    if (!ps.employee?.email) {
      skippedNoEmail++;
      continue;
    }
    try {
      const rendered = await renderPayslipPdfFor(ctx.organizationId, ps.id);
      if (!rendered) continue;
      const companyName = org?.name || "your employer";
      await sendDocumentEmail({
        orgId: ctx.organizationId,
        userId: ctx.userId,
        documentType: "payslip",
        documentId: ps.id,
        recipientEmail: ps.employee.email,
        subject: `Your payslip for ${ps.payrollRun.payPeriodStart} to ${ps.payrollRun.payPeriodEnd}`,
        body: `<p>Hi ${ps.employee.name},</p><p>Your payslip from ${companyName} for ${ps.payrollRun.payPeriodStart} to ${ps.payrollRun.payPeriodEnd} is attached.</p>`,
        attachPdf: true,
        pdfBuffer: Buffer.from(rendered.pdf),
        pdfFilename: rendered.fileName,
        replyTo: org?.contactEmail || undefined,
      });
      await db.update(payslip).set({ status: "sent", sentAt: new Date() }).where(eq(payslip.id, ps.id));
      sent++;
    } catch {
      failed.push(ps.employee.name);
    }
  }
  return { sent, skippedNoEmail, alreadySent, failed };
}

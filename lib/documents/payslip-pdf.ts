import { db } from "@/lib/db";
import { payslip } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { PdfPayslipData, PdfPayslipLine } from "./pdf-renderer";

const ITEM_TYPE_LABELS: Record<string, string> = {
  regular_salary: "Salary",
  hourly_pay: "Hourly pay",
  overtime: "Overtime",
  milestone_bonus: "Milestone bonus",
  project_bonus: "Project bonus",
  commission: "Commission",
  deduction: "Pay",
  reimbursement: "Reimbursement",
};

function humanize(kind: string): string {
  const t = kind.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * Load a payslip (scoped to the organization through its payroll run) and shape
 * it for the payslip PDF. Returns null when it doesn't exist in this org.
 * `employeeMemberId` lets the route allow employees to download their own.
 */
export async function loadPayslipPdfData(
  payslipId: string,
  organizationId: string
): Promise<{ slip: PdfPayslipData; employeeMemberId: string | null; fileName: string } | null> {
  const ps = await db.query.payslip.findFirst({
    where: eq(payslip.id, payslipId),
    with: {
      payrollRun: true,
      employee: true,
      payrollItem: { with: { taxBreakdowns: true } },
    },
  });
  if (!ps || !ps.payrollRun || ps.payrollRun.organizationId !== organizationId || !ps.employee) return null;

  const item = ps.payrollItem;
  const emp = ps.employee;
  const currencyCode = item?.currency || emp.currency || "USD";

  // Earnings: overtime and bonus split out from the base pay when recorded.
  const overtime = item?.overtimeAmount ?? 0;
  const bonus = item?.bonusAmount ?? 0;
  const base = ps.grossAmount - overtime - bonus;
  const earnings: PdfPayslipLine[] = [];
  const baseLabel = item?.description || ITEM_TYPE_LABELS[item?.type ?? "regular_salary"] || "Pay";
  if (base !== 0 || (overtime === 0 && bonus === 0)) earnings.push({ description: baseLabel, amount: base });
  if (overtime) {
    const hours = item?.overtimeHours ? ` (${item.overtimeHours} h)` : "";
    earnings.push({ description: `Overtime${hours}`, amount: overtime });
  }
  if (bonus) earnings.push({ description: "Bonus", amount: bonus });

  const taxLines: PdfPayslipLine[] = (item?.taxBreakdowns ?? [])
    .filter((t) => t.amount !== 0)
    .map((t) => ({
      description: t.jurisdiction ? `${humanize(t.taxKind)} (${t.jurisdiction})` : humanize(t.taxKind),
      amount: t.amount,
    }));

  // Named deductions saved on the payslip; anything withheld that they and the
  // tax don't explain shows as "Other deductions" so the slip always adds up.
  const saved = Array.isArray(ps.deductionsBreakdown)
    ? (ps.deductionsBreakdown as { name?: string; amount?: number; category?: string }[])
    : [];
  const deductions: PdfPayslipLine[] = saved
    .filter((d) => typeof d.amount === "number" && d.amount !== 0)
    .map((d) => ({ description: d.name || (d.category ? humanize(d.category) : "Deduction"), amount: d.amount as number }));
  const explained = ps.taxAmount + deductions.reduce((sum, d) => sum + d.amount, 0);
  const other = ps.grossAmount - ps.netAmount - explained;
  if (other > 0) deductions.push({ description: "Other deductions", amount: other });

  const slip: PdfPayslipData = {
    employeeName: emp.name,
    employeeNumber: emp.employeeNumber,
    position: emp.position,
    department: emp.department,
    employeeEmail: emp.email,
    payPeriodStart: ps.payrollRun.payPeriodStart,
    payPeriodEnd: ps.payrollRun.payPeriodEnd,
    payDate: isoDate(ps.payrollRun.processedAt),
    currencyCode,
    earnings,
    grossAmount: ps.grossAmount,
    taxAmount: ps.taxAmount,
    taxLines,
    deductions,
    netAmount: ps.netAmount,
    ytdGross: ps.ytdGross,
    ytdTax: ps.ytdTax,
    ytdNet: ps.ytdNet,
  };

  const safeName = emp.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "employee";
  return {
    slip,
    employeeMemberId: emp.memberId,
    fileName: `payslip-${safeName}-${ps.payrollRun.payPeriodEnd}.pdf`,
  };
}

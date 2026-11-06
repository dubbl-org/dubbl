"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { useApi } from "@/lib/query/use-api";

// Summary figures in display order. Amounts are cents in the base currency.
const SUMMARY_FIELDS: { key: string; label: string; money: boolean }[] = [
  { key: "totalRuns", label: "Pay runs", money: false },
  { key: "totalGross", label: "Pay before deductions", money: true },
  { key: "totalTax", label: "Tax withheld", money: true },
  { key: "totalOtherDeductions", label: "Other deductions", money: true },
  { key: "totalNet", label: "Take-home pay", money: true },
  { key: "employerTaxes", label: "Employer taxes", money: true },
  { key: "avgCostPerRun", label: "Average pay per run", money: true },
  { key: "activeEmployees", label: "Active employees", money: false },
];

export default function ReportDetailPage() {
  const { type } = useParams<{ type: string }>();
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  useDocumentTitle("Payroll · Report");

  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);

  const endpoint = type === "yoy"
    ? `/api/v1/payroll/reports/yoy`
    : type === "tax-liability"
      ? `/api/v1/payroll/reports/tax-liability`
      : type === "labor-cost"
        ? `/api/v1/payroll/reports/labor-cost`
        : `/api/v1/payroll/reports/summary`;

  const url = params.toString() ? `${endpoint}?${params}` : endpoint;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, loading } = useApi<any>(url, { keepPrevious: true, learn: !startDate && !endDate });
  const data = result ?? null;

  const titles: Record<string, string> = {
    summary: "Payroll Summary",
    "tax-liability": "Tax Liability",
    "labor-cost": "Labor Cost by Department",
    yoy: "Year over Year",
  };

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <button onClick={() => router.push("/payroll/reports")} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </button>

      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <BarChart3 className="size-5 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">{titles[type] || "Report"}</h1>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Start Date</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-sm w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End Date</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 text-sm w-40" />
        </div>
        <p className="pb-1.5 text-xs text-muted-foreground">
          Finished pay runs whose pay date (the end of the pay period) falls in these dates. Cancelled runs are left out.
        </p>
      </div>

      {/* Render data based on type */}
      {type === "tax-liability" && data?.data && (
        <div className="rounded-xl border bg-card divide-y">
          <div className="px-4 py-2.5 flex items-center justify-between bg-muted/50 rounded-t-xl">
            <span className="text-xs font-medium text-muted-foreground">Employee</span>
            <div className="flex gap-8">
              <span className="text-xs font-medium text-muted-foreground w-24 text-right">Gross</span>
              <span className="text-xs font-medium text-muted-foreground w-24 text-right">Tax withheld</span>
              <span className="text-xs font-medium text-muted-foreground w-24 text-right">Employer tax</span>
            </div>
          </div>
          {data.data.map((row: { employeeId: string; employeeName: string; totalGross: number; totalTax: number; employerTax?: number }) => (
            <div key={row.employeeId} className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm">{row.employeeName}</span>
              <div className="flex gap-8">
                <span className="text-sm font-mono tabular-nums w-24 text-right">{formatMoney(row.totalGross)}</span>
                <span className="text-sm font-mono tabular-nums w-24 text-right text-red-600 dark:text-red-400">{formatMoney(row.totalTax)}</span>
                <span className="text-sm font-mono tabular-nums w-24 text-right">{formatMoney(row.employerTax ?? 0)}</span>
              </div>
            </div>
          ))}
          {data.totalTax !== undefined && (
            <div className="px-4 py-2.5 flex items-center justify-between font-medium">
              <span className="text-sm">Total</span>
              <div className="flex gap-8">
                <span className="text-sm font-mono tabular-nums w-24 text-right text-red-600 dark:text-red-400">{formatMoney(data.totalTax)}</span>
                <span className="text-sm font-mono tabular-nums w-24 text-right">{formatMoney(data.totalEmployerTax ?? 0)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {type === "labor-cost" && data?.data && (
        <div className="rounded-xl border bg-card divide-y">
          <div className="px-4 py-2.5 flex items-center justify-between bg-muted/50 rounded-t-xl">
            <span className="text-xs font-medium text-muted-foreground">Department</span>
            <div className="flex gap-8">
              <span className="text-xs font-medium text-muted-foreground w-16 text-right">Employees</span>
              <span className="text-xs font-medium text-muted-foreground w-24 text-right">Gross</span>
              <span className="text-xs font-medium text-muted-foreground w-24 text-right">Net</span>
            </div>
          </div>
          {data.data.map((row: { department: string; employeeCount: number; totalGross: number; totalNet: number }, i: number) => (
            <div key={i} className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm">{row.department}</span>
              <div className="flex gap-8">
                <span className="text-sm font-mono tabular-nums w-16 text-right">{row.employeeCount}</span>
                <span className="text-sm font-mono tabular-nums w-24 text-right">{formatMoney(row.totalGross)}</span>
                <span className="text-sm font-mono tabular-nums w-24 text-right">{formatMoney(row.totalNet)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {type === "yoy" && data?.data && (
        <div className="rounded-xl border bg-card divide-y">
          <div className="px-4 py-2.5 flex items-center justify-between bg-muted/50 rounded-t-xl">
            <span className="text-xs font-medium text-muted-foreground">Month</span>
            <div className="flex gap-8">
              <span className="text-xs font-medium text-muted-foreground w-16 text-right">Runs</span>
              <span className="text-xs font-medium text-muted-foreground w-24 text-right">Gross</span>
              <span className="text-xs font-medium text-muted-foreground w-24 text-right">Net</span>
              <span className="text-xs font-medium text-muted-foreground w-24 text-right">Gross last year</span>
              <span className="text-xs font-medium text-muted-foreground w-16 text-right">Change</span>
            </div>
          </div>
          {data.data.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No finished pay runs in these dates</p>
          )}
          {data.data.map((row: { month: string; runCount: number; totalGross: number; totalNet: number; priorYearGross: number; changePercent: number | null }) => (
            <div key={row.month} className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm font-mono">{row.month}</span>
              <div className="flex gap-8">
                <span className="text-sm font-mono tabular-nums w-16 text-right">{row.runCount}</span>
                <span className="text-sm font-mono tabular-nums w-24 text-right">{formatMoney(row.totalGross)}</span>
                <span className="text-sm font-mono tabular-nums w-24 text-right">{formatMoney(row.totalNet)}</span>
                <span className="text-sm font-mono tabular-nums w-24 text-right text-muted-foreground">{formatMoney(row.priorYearGross)}</span>
                <span className="text-sm font-mono tabular-nums w-16 text-right">
                  {row.changePercent == null ? "-" : `${row.changePercent > 0 ? "+" : ""}${row.changePercent}%`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {type === "summary" && data?.summary && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUMMARY_FIELDS.filter((f) => typeof data.summary[f.key] === "number").map((f) => (
            <div key={f.key} className="rounded-xl border bg-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{f.label}</p>
              <p className="mt-1 text-xl font-bold font-mono tabular-nums">
                {f.money ? formatMoney(data.summary[f.key]) : String(data.summary[f.key])}
              </p>
            </div>
          ))}
        </div>
      )}
    </ContentReveal>
  );
}

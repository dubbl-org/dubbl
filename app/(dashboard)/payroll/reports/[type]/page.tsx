"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";

export default function ReportDetailPage() {
  const { type } = useParams<{ type: string }>();
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  useDocumentTitle("Payroll · Report");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) return;
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

    fetch(url, { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [type, orgId, startDate, endDate]);

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

      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Start Date</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-sm w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">End Date</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 text-sm w-40" />
        </div>
      </div>

      {/* Render data based on type */}
      {type === "tax-liability" && data?.data && (
        <div className="rounded-xl border bg-card divide-y">
          <div className="px-4 py-2.5 flex items-center justify-between bg-muted/50 rounded-t-xl">
            <span className="text-xs font-medium text-muted-foreground">Employee</span>
            <div className="flex gap-8">
              <span className="text-xs font-medium text-muted-foreground w-24 text-right">Gross</span>
              <span className="text-xs font-medium text-muted-foreground w-24 text-right">Tax</span>
            </div>
          </div>
          {data.data.map((row: { employeeId: string; employeeName: string; totalGross: number; totalTax: number }) => (
            <div key={row.employeeId} className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm">{row.employeeName}</span>
              <div className="flex gap-8">
                <span className="text-sm font-mono tabular-nums w-24 text-right">{formatMoney(row.totalGross)}</span>
                <span className="text-sm font-mono tabular-nums w-24 text-right text-red-600 dark:text-red-400">{formatMoney(row.totalTax)}</span>
              </div>
            </div>
          ))}
          {data.totalTax !== undefined && (
            <div className="px-4 py-2.5 flex items-center justify-between font-medium">
              <span className="text-sm">Total</span>
              <span className="text-sm font-mono tabular-nums text-red-600 dark:text-red-400">{formatMoney(data.totalTax)}</span>
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
            </div>
          </div>
          {data.data.map((row: { month: string; runCount: number; totalGross: number; totalNet: number }) => (
            <div key={row.month} className="px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm font-mono">{row.month}</span>
              <div className="flex gap-8">
                <span className="text-sm font-mono tabular-nums w-16 text-right">{row.runCount}</span>
                <span className="text-sm font-mono tabular-nums w-24 text-right">{formatMoney(row.totalGross)}</span>
                <span className="text-sm font-mono tabular-nums w-24 text-right">{formatMoney(row.totalNet)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {type === "summary" && data?.summary && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(data.summary).map(([key, value]) => (
            <div key={key} className="rounded-xl border bg-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{key.replace(/([A-Z])/g, " $1").trim()}</p>
              <p className="mt-1 text-xl font-bold font-mono tabular-nums">
                {typeof value === "number" && key !== "totalRuns" && key !== "activeEmployees"
                  ? formatMoney(value as number)
                  : String(value)}
              </p>
            </div>
          ))}
        </div>
      )}
    </ContentReveal>
  );
}

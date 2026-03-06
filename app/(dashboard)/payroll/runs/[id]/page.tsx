"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Play } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";

interface PayrollRunDetail {
  id: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  status: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  processedAt: string | null;
  items: PayrollItemRow[];
}

interface PayrollItemRow {
  id: string;
  grossAmount: number;
  taxAmount: number;
  deductions: number;
  netAmount: number;
  employee: { name: string; employeeNumber: string } | null;
}

const statusColors: Record<string, string> = {
  draft: "",
  processing: "border-blue-200 bg-blue-50 text-blue-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  void: "border-gray-200 bg-gray-50 text-gray-700",
};

const columns: Column<PayrollItemRow>[] = [
  {
    key: "employee",
    header: "Employee",
    render: (r) => (
      <div>
        <span className="text-sm font-medium">{r.employee?.name || "-"}</span>
        <span className="ml-2 text-xs text-muted-foreground">{r.employee?.employeeNumber}</span>
      </div>
    ),
  },
  {
    key: "gross",
    header: "Gross",
    className: "w-28 text-right",
    render: (r) => <span className="font-mono text-sm tabular-nums">{formatMoney(r.grossAmount)}</span>,
  },
  {
    key: "tax",
    header: "Tax",
    className: "w-28 text-right",
    render: (r) => <span className="font-mono text-sm tabular-nums">{formatMoney(r.taxAmount)}</span>,
  },
  {
    key: "deductions",
    header: "Deductions",
    className: "w-28 text-right",
    render: (r) => <span className="font-mono text-sm tabular-nums">{formatMoney(r.deductions)}</span>,
  },
  {
    key: "net",
    header: "Net Pay",
    className: "w-28 text-right",
    render: (r) => <span className="font-mono text-sm tabular-nums font-medium">{formatMoney(r.netAmount)}</span>,
  },
];

export default function PayrollRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<PayrollRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/payroll/runs/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.run) setRun(data.run);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleProcess() {
    if (!confirm("Process this payroll run? This will create journal entries and cannot be undone.")) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setProcessing(true);

    try {
      const res = await fetch(`/api/v1/payroll/runs/${id}/process`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Payroll run processed");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process payroll");
    } finally {
      setProcessing(false);
    }
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!run) return <div className="space-y-6"><PageHeader title="Payroll run not found" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Pay Run: ${run.payPeriodStart} to ${run.payPeriodEnd}`}
        description={run.processedAt ? `Processed ${run.processedAt}` : "Draft payroll run"}
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/payroll/runs"><ArrowLeft className="mr-2 size-4" />Back</Link>
        </Button>
        {run.status === "draft" && (
          <Button
            size="sm"
            onClick={handleProcess}
            disabled={processing}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Play className="mr-2 size-4" />
            {processing ? "Processing..." : "Process Payroll"}
          </Button>
        )}
      </PageHeader>

      <Badge variant="outline" className={statusColors[run.status] || ""}>
        {run.status}
      </Badge>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total Gross</p>
          <p className="text-xl font-bold font-mono">{formatMoney(run.totalGross)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total Deductions</p>
          <p className="text-xl font-bold font-mono text-red-600">{formatMoney(run.totalDeductions)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total Net Pay</p>
          <p className="text-xl font-bold font-mono text-emerald-600">{formatMoney(run.totalNet)}</p>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Employees ({run.items?.length || 0})</h3>
        <DataTable
          columns={columns}
          data={run.items || []}
          loading={false}
          emptyMessage="No employees in this run."
        />
      </div>
    </div>
  );
}

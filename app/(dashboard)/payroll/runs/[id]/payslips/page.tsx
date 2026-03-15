"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

interface Payslip {
  id: string;
  grossAmount: number;
  netAmount: number;
  taxAmount: number;
  ytdGross: number;
  ytdNet: number;
  status: string;
  employee: { name: string; employeeNumber: string } | null;
}

export default function RunPayslipsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
  useDocumentTitle("Payroll · Payslips");

  useEffect(() => {
    // Fetch payslips for all employees in this run
    // Since there's no direct endpoint for run payslips, we fetch the run items
    // and check if payslips exist
    if (!orgId) return;
    fetch(`/api/v1/payroll/runs/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then(() => {
        // For now, show a placeholder - payslips are fetched per employee
        setPayslips([]);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <button onClick={() => router.push(`/payroll/runs/${id}`)} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to run
      </button>

      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <FileText className="size-5 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">Payslips</h1>
      </div>

      {payslips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
            <FileText className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No payslips generated yet</p>
          <p className="text-xs text-muted-foreground mt-1">Use the &quot;Generate Payslips&quot; button on the run detail page</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card divide-y">
          {payslips.map((ps) => (
            <div key={ps.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{ps.employee?.name || "-"}</p>
                <p className="text-xs text-muted-foreground font-mono">{ps.employee?.employeeNumber}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Gross</p>
                  <p className="text-sm font-mono tabular-nums">{formatMoney(ps.grossAmount)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Net</p>
                  <p className="text-sm font-mono tabular-nums font-medium">{formatMoney(ps.netAmount)}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{ps.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </ContentReveal>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { BarChart3, FileText, DollarSign, TrendingUp, Download } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useApi } from "@/lib/query/use-api";
import { toast } from "sonner";
import { downloadFile } from "@/components/dashboard/download-link";

interface Summary {
  totalRuns: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  activeEmployees: number;
  avgCostPerRun: number;
}

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

const REPORT_TYPES = [
  { type: "summary", label: "Payroll Summary", description: "Overview of payroll totals and averages", icon: BarChart3 },
  { type: "tax-liability", label: "Tax Liability", description: "Tax breakdown by employee", icon: FileText },
  { type: "labor-cost", label: "Labor Cost", description: "Cost breakdown by department", icon: DollarSign },
  { type: "yoy", label: "Year over Year", description: "Each month compared with the same month last year", icon: TrendingUp },
];

export default function ReportsPage() {
  const router = useRouter();
  const { data, loading } = useApi<{ summary?: Summary }>("/api/v1/payroll/reports/summary");
  const summary = data?.summary ?? null;

  useDocumentTitle("Payroll · Reports");

  // Fetch with the org header (a plain link can't send it) and save the file
  function handleExport() {
    downloadFile("/api/v1/payroll/reports/export", "payroll-export.csv").catch((err) =>
      toast.error(err instanceof Error ? err.message : "Couldn't export payroll")
    );
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <PageHeader title="Payroll Reports" description="Analytics and insights for your payroll data.">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleExport}>
          <Download className="mr-1.5 size-3" /> Export CSV
        </Button>
      </PageHeader>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Runs</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums">{summary.totalRuns}</p>
          </motion.div>
          <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Gross</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums">{formatMoney(summary.totalGross)}</p>
          </motion.div>
          <motion.div {...anim(0.1)} className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Net</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-brand-600 dark:text-brand-400">{formatMoney(summary.totalNet)}</p>
          </motion.div>
          <motion.div {...anim(0.15)} className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Avg Cost/Run</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums">{formatMoney(summary.avgCostPerRun)}</p>
          </motion.div>
        </div>
      )}

      {/* Report type cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {REPORT_TYPES.map((report, i) => (
          <motion.button
            key={report.type}
            {...anim(0.2 + i * 0.05)}
            onClick={() => router.push(`/payroll/reports/${report.type}`)}
            className="flex items-start gap-4 rounded-xl border bg-card p-4 text-left hover:bg-muted/50 transition-colors"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <report.icon className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{report.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{report.description}</p>
            </div>
          </motion.button>
        ))}
      </div>
    </ContentReveal>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Play, Search, X, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@/lib/utils";

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
  processing: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

export default function PayrollRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<PayrollRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

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
    const confirmed = await confirm({
      title: "Process this payroll run?",
      description: "This will create journal entries and cannot be undone.",
      confirmLabel: "Process",
      destructive: true,
    });
    if (!confirmed) return;
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

  if (loading) return <BrandLoader />;

  if (!run) {
    return (
      <ContentReveal>
        <button
          onClick={() => router.push("/payroll/runs")}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="size-3.5" />
          Back to runs
        </button>
        <p className="text-sm text-muted-foreground">Payroll run not found</p>
      </ContentReveal>
    );
  }

  const filteredItems = (run.items || []).filter((item) => {
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    const nameMatch = item.employee?.name.toLowerCase().includes(q);
    const numMatch = item.employee?.employeeNumber.toLowerCase().includes(q);
    return nameMatch || numMatch;
  });

  return (
    <ContentReveal className="space-y-6">
      {/* Back link */}
      <button
        onClick={() => router.push("/payroll/runs")}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Back to runs
      </button>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex size-10 items-center justify-center rounded-xl",
            run.status === "completed"
              ? "bg-emerald-50 dark:bg-emerald-950/40"
              : "bg-muted"
          )}>
            <FileText className={cn(
              "size-5",
              run.status === "completed"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground"
            )} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">
                {run.payPeriodStart} to {run.payPeriodEnd}
              </h1>
              <Badge variant="outline" className={statusColors[run.status] || ""}>
                {run.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {run.processedAt ? `Processed ${run.processedAt}` : "Draft payroll run"}
            </p>
          </div>
        </div>
        {run.status === "draft" && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleProcess}
              disabled={processing}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Play className="mr-1.5 size-3.5" />
              {processing ? "Processing..." : "Process Payroll"}
            </Button>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Gross</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate">{formatMoney(run.totalGross)}</p>
        </motion.div>
        <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Deductions</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate text-red-600 dark:text-red-400">{formatMoney(run.totalDeductions)}</p>
        </motion.div>
        <motion.div {...anim(0.09)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Net Pay</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate text-emerald-600 dark:text-emerald-400">{formatMoney(run.totalNet)}</p>
        </motion.div>
      </div>

      {/* Employee items */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold">Employees ({run.items?.length || 0})</h3>
          <div className="relative sm:max-w-xs w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8 h-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <FileText className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">
              {search ? "No employees match your search" : "No employees in this run"}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.employee?.name || "-"}</p>
                  <p className="text-xs text-muted-foreground font-mono">{item.employee?.employeeNumber}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="hidden sm:block text-right">
                    <p className="text-xs text-muted-foreground">Gross</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(item.grossAmount)}</p>
                  </div>
                  <div className="hidden sm:block text-right">
                    <p className="text-xs text-muted-foreground">Tax</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(item.taxAmount)}</p>
                  </div>
                  <div className="hidden sm:block text-right">
                    <p className="text-xs text-muted-foreground">Deductions</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(item.deductions)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Net</p>
                    <p className="text-sm font-mono tabular-nums font-medium">{formatMoney(item.netAmount)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDialog}
    </ContentReveal>
  );
}

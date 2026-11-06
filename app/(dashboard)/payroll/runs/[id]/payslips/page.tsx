"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileText, ChevronDown, ScrollText, Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { cn } from "@/lib/utils";
import { useApi, useApiCache, useApis } from "@/lib/query/use-api";
import { downloadFile } from "@/components/dashboard/download-link";

interface TaxLine {
  id: string;
  jurisdictionLevel: string; // federal | state | local
  jurisdiction: string | null;
  taxKind: string; // income_tax | social_security | medicare | additional_medicare
  amount: number; // cents
}

interface RunItem {
  id: string;
  employeeId: string;
  employee: { name: string; employeeNumber: string } | null;
  taxBreakdowns?: TaxLine[];
  deductionBreakdowns?: { id: string; amount: number; category: string; deductionType: { name: string } | null }[];
}

const TAX_ORDER = ["income_tax", "social_security", "medicare", "additional_medicare"];
const LEVEL_ORDER = ["federal", "state", "local"];

/** "Federal income tax", "State income tax (CA)", "Social Security", ... */
function taxLabel(t: TaxLine): string {
  switch (t.taxKind) {
    case "income_tax": {
      const level = t.jurisdictionLevel === "state" ? "State" : t.jurisdictionLevel === "local" ? "Local" : "Federal";
      return `${level} income tax${t.jurisdiction && t.jurisdictionLevel !== "federal" ? ` (${t.jurisdiction})` : ""}`;
    }
    case "social_security":
      return "Social Security";
    case "medicare":
      return "Medicare";
    case "additional_medicare":
      return "Additional Medicare";
    default:
      return t.taxKind.replace(/_/g, " ");
  }
}

function sortTaxLines(lines: TaxLine[]): TaxLine[] {
  const rank = (t: TaxLine) => {
    const k = TAX_ORDER.indexOf(t.taxKind);
    return (k === -1 ? TAX_ORDER.length : k) * 10 + Math.max(0, LEVEL_ORDER.indexOf(t.jurisdictionLevel));
  };
  return [...lines].sort((a, b) => rank(a) - rank(b));
}

interface RunDetail {
  id: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  items: RunItem[];
}

interface DeductionLine {
  name?: string;
  amount?: number;
  category?: string;
}

interface Payslip {
  id: string;
  employeeId: string;
  payrollRunId: string;
  status: string;
  grossAmount: number;
  netAmount: number;
  taxAmount: number;
  deductionsBreakdown: DeductionLine[] | null;
  ytdGross: number;
  ytdNet: number;
  ytdTax: number;
}

// Plain-language payslip status labels for non-accountants.
const statusLabels: Record<string, string> = {
  generated: "Ready",
  sent: "Sent",
  viewed: "Opened",
};

interface Row {
  employeeId: string;
  name: string;
  employeeNumber: string;
  payslip: Payslip | null;
  taxLines: TaxLine[];
  deductionLines: DeductionLine[];
}

const payslipsUrl = (employeeId: string) => `/api/v1/payroll/employees/${employeeId}/payslips`;

export default function RunPayslipsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const cache = useApiCache();

  useDocumentTitle("Payroll · Payslips");

  // 1. Get the run so we know every employee on it (and the pay period).
  const { data: runData, loading: runLoading } = useApi<{ run?: RunDetail }>(`/api/v1/payroll/runs/${id}`);
  const run = runData?.run ?? null;

  // 2. There is no per-run payslip endpoint, so fetch each employee's
  //    payslips and pick the one generated for this run.
  const items = useMemo(() => run?.items || [], [run]);
  const employeeIds = items.map((item) => item.employeeId).filter(Boolean);
  const payslipQueries = useApis<{ data?: Payslip[] }>(employeeIds.map(payslipsUrl));
  const payslipsLoading = payslipQueries.loading;
  const loading = runLoading || payslipsLoading;
  const rows: Row[] = items.map((item) => {
    let slip: Payslip | null = null;
    if (item.employeeId && run) {
      const list = payslipQueries.data[employeeIds.indexOf(item.employeeId)]?.data || [];
      slip = list.find((p) => p.payrollRunId === run.id) || null;
    }
    return {
      employeeId: item.employeeId,
      name: item.employee?.name || "-",
      employeeNumber: item.employee?.employeeNumber || "",
      payslip: slip,
      taxLines: sortTaxLines((item.taxBreakdowns ?? []).filter((t) => t.amount > 0)),
      // The payslip keeps its own copy of the deduction lines; fall back to the run item's
      deductionLines:
        slip?.deductionsBreakdown && slip.deductionsBreakdown.length > 0
          ? slip.deductionsBreakdown
          : (item.deductionBreakdowns ?? []).map((d) => ({ name: d.deductionType?.name, amount: d.amount, category: d.category })),
    };
  });

  // Opening a payslip detail marks it as viewed on the server. Refresh that
  // row's status so the badge reflects it.
  async function toggle(row: Row) {
    if (!row.payslip) return;
    const next = expanded === row.payslip.id ? null : row.payslip.id;
    setExpanded(next);
    if (next && row.payslip.status !== "viewed") {
      const orgId = localStorage.getItem("activeOrgId");
      if (!orgId) return;
      try {
        await fetch(`/api/v1/payroll/payslips/${row.payslip.id}`, {
          headers: { "x-organization-id": orgId },
        });
        cache.update<{ data?: Payslip[] }>(payslipsUrl(row.employeeId), (d) => ({
          ...d,
          data: d.data?.map((p) => (p.id === row.payslip!.id ? { ...p, status: "viewed" } : p)),
        }));
      } catch {
        /* non-fatal */
      }
    }
  }

  if (loading) return <BrandLoader />;

  const generated = rows.filter((r) => r.payslip).length;

  return (
    <ContentReveal className="space-y-6">
      <button
        onClick={() => router.push(`/payroll/runs/${id}`)}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Back to run
      </button>

      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <ScrollText className="size-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Payslips</h1>
          {run && (
            <p className="text-sm text-muted-foreground">
              {run.payPeriodStart} to {run.payPeriodEnd}
            </p>
          )}
        </div>
      </div>

      {generated === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
            <FileText className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No payslips yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use the &quot;Generate Payslips&quot; button on the run page to create a
            payslip for every employee.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => router.push(`/payroll/runs/${id}`)}
          >
            Go to run
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card divide-y">
          {rows.map((row) => {
            const ps = row.payslip;
            const isOpen = ps && expanded === ps.id;
            // Tax + everything else withheld = take-home subtracted from gross.
            const totalDeductions = ps ? ps.grossAmount - ps.netAmount : 0;
            const otherDeductions = ps
              ? Math.max(totalDeductions - ps.taxAmount, 0)
              : 0;
            return (
              <div key={row.employeeId}>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.name}</p>
                    {row.employeeNumber && (
                      <p className="text-xs text-muted-foreground font-mono">
                        {row.employeeNumber}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {ps ? (
                      <>
                        <div className="hidden sm:block text-right">
                          <p className="text-xs text-muted-foreground">
                            Before deductions
                          </p>
                          <p className="text-sm font-mono tabular-nums">
                            {formatMoney(ps.grossAmount)}
                          </p>
                        </div>
                        <div className="hidden sm:block text-right">
                          <p className="text-xs text-muted-foreground">
                            Taxes &amp; deductions
                          </p>
                          <p className="text-sm font-mono tabular-nums text-red-600 dark:text-red-400">
                            {formatMoney(totalDeductions)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            Take-home
                          </p>
                          <p className="text-sm font-mono tabular-nums font-medium">
                            {formatMoney(ps.netAmount)}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {statusLabels[ps.status] || ps.status}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggle(row)}
                        >
                          {isOpen ? "Hide" : "View payslip"}
                          <ChevronDown
                            className={cn(
                              "ml-1.5 size-3.5 transition-transform",
                              isOpen && "rotate-180"
                            )}
                          />
                        </Button>
                      </>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        No payslip
                      </Badge>
                    )}
                  </div>
                </div>

                {isOpen && ps && (
                  <div className="border-t bg-muted/30 px-4 py-4">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
                      <Detail label="Before deductions" value={formatMoney(ps.grossAmount)} />
                      <Detail label="Tax withheld" value={formatMoney(ps.taxAmount)} />
                      <Detail label="Other deductions" value={formatMoney(otherDeductions)} />
                      <Detail label="Take-home" value={formatMoney(ps.netAmount)} emphasize />
                    </div>

                    {row.taxLines.length > 0 && (
                      <div className="mt-4">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                          Taxes
                        </p>
                        <div className="rounded-lg border bg-card divide-y">
                          {row.taxLines.map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center justify-between px-3 py-2"
                            >
                              <span className="text-xs">{taxLabel(t)}</span>
                              <span className="text-xs font-mono tabular-nums">
                                {formatMoney(t.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {row.deductionLines.length > 0 && (
                      <div className="mt-4">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                          Deductions
                        </p>
                        <div className="rounded-lg border bg-card divide-y">
                          {row.deductionLines.map((d, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between px-3 py-2"
                            >
                              <span className="text-xs">
                                {d.name || "Deduction"}
                                {d.category && (
                                  <span className="ml-1.5 text-muted-foreground">
                                    {d.category === "pre_tax" ? "Pre-tax" : "Post-tax"}
                                  </span>
                                )}
                              </span>
                              <span className="text-xs font-mono tabular-nums">
                                {formatMoney(d.amount || 0)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                        This year so far
                      </p>
                      <div className="grid grid-cols-3 gap-x-8 gap-y-2">
                        <Detail label="Earned" value={formatMoney(ps.ytdGross)} small />
                        <Detail label="Tax" value={formatMoney(ps.ytdTax)} small />
                        <Detail label="Take-home" value={formatMoney(ps.ytdNet)} small />
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          downloadFile(`/api/v1/payroll/payslips/${ps.id}/pdf?format=pdf`, `payslip-${row.name}.pdf`).catch((err) =>
                            toast.error(err instanceof Error ? err.message : "Couldn't download the payslip")
                          )
                        }
                      >
                        <Download className="mr-1.5 size-3.5" />
                        Download PDF
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {generated > 0 && generated < rows.length && (
        <p className="text-xs text-muted-foreground">
          {rows.length - generated} employee
          {rows.length - generated === 1 ? " has" : "s have"} no payslip yet. Use
          &quot;Generate Payslips&quot; on the run page to create the missing ones.
        </p>
      )}
    </ContentReveal>
  );
}

function Detail({
  label,
  value,
  emphasize,
  small,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  small?: boolean;
}) {
  return (
    <div>
      <p
        className={cn(
          "text-muted-foreground",
          small ? "text-[11px]" : "text-xs"
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "font-mono tabular-nums",
          small ? "text-xs" : "text-sm",
          emphasize && "font-semibold"
        )}
      >
        {value}
      </p>
    </div>
  );
}

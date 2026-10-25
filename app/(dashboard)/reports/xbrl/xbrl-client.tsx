"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileCode2 } from "lucide-react";
import { ContentReveal } from "@/components/shared/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackToReports } from "@/app/(dashboard)/reports/_components";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";

interface ValidationIssue {
  severity: "genuine" | "possible";
  ruleId: string;
  message: string;
  element?: string;
}

interface XbrlResponse {
  fileName: string;
  template: "sim" | "full";
  templateChosenBecause: string;
  accountingStandard: string;
  uen: string;
  companyName: string;
  period: {
    startDate: string;
    endDate: string;
    priorStartDate: string;
    priorEndDate: string;
  };
  size: { revenue: number; totalAssets: number };
  files: string[];
  issueCounts: { genuine: number; possible: number };
  issues: ValidationIssue[];
  readyToDownload: boolean;
  nextSteps: string[];
}

const money = (cents: number) =>
  `S$${(cents / 100).toLocaleString("en-SG", { maximumFractionDigits: 0 })}`;

/**
 * ACRA annual-return filing page: pick the financial year, read the validation
 * report, download the package, upload it at BizFinx.
 */
export default function XbrlPage({ initialData }: { initialData: Record<string, unknown> | null }) {
  useEntityTitle("Annual return (XBRL)");
  const now = new Date();
  const [fiscalYearEnd, setFiscalYearEnd] = useState(
    `${now.getFullYear() - 1}-12-31`
  );
  const [data, setData] = useState<XbrlResponse | null>(
    (initialData as unknown as XbrlResponse)?.fileName
      ? (initialData as unknown as XbrlResponse)
      : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/reports/xbrl?${new URLSearchParams({ fiscalYearEnd })}`, {
      headers: { "x-organization-id": orgId },
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not build the package");
        return d;
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  const downloadHref = `/api/v1/reports/xbrl?${new URLSearchParams({
    fiscalYearEnd,
    format: "zip",
  })}`;

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />

      <PageHeader
        title="Annual return (XBRL)"
        description="The financial statements ACRA wants, in the format BizFinx accepts."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Financial year end</Label>
          <Input
            type="date"
            value={fiscalYearEnd}
            onChange={(e) => setFiscalYearEnd(e.target.value)}
            className="w-44"
          />
        </div>
        <Button onClick={load} disabled={loading} variant="outline">
          {loading ? "Building…" : "Build package"}
        </Button>
      </div>

      {error && (
        <div className="flex gap-2 rounded-lg border border-red-300/60 bg-red-50/60 p-3 text-sm dark:bg-red-950/20">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
          <p>{error}</p>
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Company</p>
              <p className="mt-1 text-sm font-medium">{data.companyName}</p>
              <p className="text-xs text-muted-foreground">UEN {data.uen}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Template</p>
              <p className="mt-1 text-sm font-medium">
                {data.template === "sim" ? "Simplified XBRL" : "Full XBRL"}
              </p>
              <p className="text-xs text-muted-foreground">{data.templateChosenBecause}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Year</p>
              <p className="mt-1 text-sm font-medium">
                {data.period.startDate} → {data.period.endDate}
              </p>
              <p className="text-xs text-muted-foreground">
                Revenue {money(data.size.revenue)} · assets {money(data.size.totalAssets)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {data.readyToDownload ? (
              <a
                href={downloadHref}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Download className="size-4" />
                Download {data.fileName}.zip
              </a>
            ) : (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm text-muted-foreground">
                <AlertTriangle className="size-4 text-amber-600" />
                {data.issueCounts.genuine} error(s) to fix before this can be filed
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {data.files.length} files · {data.issueCounts.possible} warning(s)
            </span>
          </div>

          {data.issues.length > 0 && (
            <div className="divide-y rounded-lg border">
              {data.issues.map((i, index) => (
                <div key={`${i.ruleId}-${index}`} className="flex gap-2 px-3 py-2.5 text-sm">
                  {i.severity === "genuine" ? (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-amber-500" />
                  )}
                  <div>
                    <p>{i.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.ruleId}
                      {i.element ? ` · ${i.element}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.issues.length === 0 && (
            <div className="flex gap-2 rounded-lg border p-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <p>No validation issues. Ready for BizFinx Validate.</p>
            </div>
          )}

          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">What to do next</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {data.nextSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>

          <details className="rounded-lg border p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <FileCode2 className="size-4" />
              Files in the package
            </summary>
            <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
              {data.files.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </ContentReveal>
  );
}

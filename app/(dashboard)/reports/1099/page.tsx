"use client";

import { useState, useEffect } from "react";
import { FileText, AlertTriangle } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportButton } from "@/components/dashboard/export-button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BackToReports, ReportHelp } from "../_components";

interface Vendor1099 {
  contactId: string;
  name: string;
  taxIdentifier: string | null;
  w9TaxClassification: string | null;
  backupWithholding: boolean;
  totalPaid: number;
  paymentCount: number;
  reportable: boolean;
}

interface Report1099 {
  taxYear: number;
  threshold: number;
  vendors: Vendor1099[];
  reportableCount: number;
  reportableTotal: number;
  grandTotal: number;
}

export default function Form1099Page() {
  const now = new Date();
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(now.getFullYear() - 1);
  const [data, setData] = useState<Report1099 | null>(null);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/v1/reports/1099?year=${year}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.vendors) setData(d);
        else setData(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, [year]);

  if (initialLoad) return <BrandLoader />;

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2, now.getFullYear() - 3];

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />

      <PageHeader
        title="1099 vendor totals (US)"
        description="Total payments to each 1099 contractor for the year."
      >
        {data && (
          <ExportButton
            data={data.vendors}
            columns={["name", "taxIdentifier", "totalPaid", "paymentCount", "reportable"]}
            filename={`1099-${year}`}
          />
        )}
      </PageHeader>

      <ReportHelp>
        For US tax: this adds up everything you paid each contractor you marked as
        a 1099 vendor. Card payments are left out (the card company reports those).
        Anyone you paid at or above the threshold needs a 1099 form.
      </ReportHelp>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-muted-foreground">Tax year:</span>
        {years.map((y) => (
          <Button
            key={y}
            variant={year === y ? "default" : "outline"}
            size="sm"
            onClick={() => setYear(y)}
            className={year === y ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            {y}
          </Button>
        ))}
      </div>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : !data || data.vendors.length === 0 ? (
        <ContentReveal>
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
              <FileText className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">No 1099 contractors</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              No contacts are marked as 1099 vendors, or none were paid in {year}. Mark a contact as a 1099 vendor to track them here.
            </p>
          </div>
        </ContentReveal>
      ) : (
        <ContentReveal>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-card/80 p-4">
                <p className="text-xs text-muted-foreground">Need a 1099 form</p>
                <p className="mt-1 text-xl font-bold">{data.reportableCount}</p>
                <p className="text-xs text-muted-foreground">paid at or above the threshold</p>
              </div>
              <div className="rounded-xl border bg-card/80 p-4">
                <p className="text-xs text-muted-foreground">Total paid to those contractors</p>
                <p className="mt-1 text-xl font-bold font-mono tabular-nums">{formatMoney(data.reportableTotal)}</p>
              </div>
              <div className="rounded-xl border bg-card/80 p-4">
                <p className="text-xs text-muted-foreground">Reporting threshold</p>
                <p className="mt-1 text-xl font-bold font-mono tabular-nums">{formatMoney(data.threshold)}</p>
              </div>
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Contractor</TableHead>
                    <TableHead>Tax ID</TableHead>
                    <TableHead className="text-right w-24">Payments</TableHead>
                    <TableHead className="text-right w-32">Total paid</TableHead>
                    <TableHead className="w-36">Needs a form?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.vendors.map((v) => (
                    <TableRow key={v.contactId}>
                      <TableCell className="font-medium">
                        {v.name}
                        {v.backupWithholding && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="size-3" /> backup withholding
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {v.taxIdentifier || <span className="text-amber-600">missing</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{v.paymentCount}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(v.totalPaid)}</TableCell>
                      <TableCell>
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          v.reportable
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {v.reportable ? "Yes — file a 1099" : "Below threshold"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}

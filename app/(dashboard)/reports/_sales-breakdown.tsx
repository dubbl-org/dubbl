"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { formatMoney } from "@/lib/money";
import { useApi } from "@/lib/query/use-api";
import { BackToReports, ReportHelp } from "./_components";
import { DownloadLink } from "@/components/dashboard/download-link";

export interface BreakdownRow {
  key: string;
  name: string;
  code?: string | null;
  href?: string | null;
  net: number;
  tax: number;
  gross: number;
  /** Second number shown per row, e.g. invoices or units sold. */
  count: number;
}

/**
 * A ranked "who/what earned the most" report: net sales per row with its share
 * of the total, plus tax and gross. Used by Sales by customer and Sales by item.
 */
export function SalesBreakdown({
  endpoint,
  title,
  description,
  help,
  nameLabel,
  countLabel,
  formatCount = (n) => n.toLocaleString(),
  pick,
}: {
  endpoint: string;
  title: string;
  description: string;
  help: React.ReactNode;
  nameLabel: string;
  countLabel: string;
  formatCount?: (n: number) => string;
  pick: (json: Record<string, unknown>) => BreakdownRow[];
}) {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const { data, loading } = useApi<Record<string, unknown>>(`${endpoint}?${new URLSearchParams({ startDate, endDate })}`, { keepPrevious: true });
  // `pick` is a pure mapper defined by the page
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => (data ? pick(data) : []), [data]);

  if (loading) return <BrandLoader />;
  const total = rows.reduce((s, r) => s + r.net, 0);
  const tax = rows.reduce((s, r) => s + r.tax, 0);
  const count = rows.reduce((s, r) => s + r.count, 0);
  const top = rows[0];
  const download = (format: "pdf" | "xlsx") => `${endpoint}?${new URLSearchParams({ startDate, endDate, format })}`;

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />
      <PageHeader title={title} description={description}>
        <DownloadLink href={download("pdf")} filename="report.pdf" className="inline-flex h-8 items-center rounded-lg border border-border/80 px-3 text-[13px] font-medium hover:bg-foreground/[0.03]">
          Download PDF
        </DownloadLink>
        <DownloadLink href={download("xlsx")} filename="report.xlsx" className="inline-flex h-8 items-center rounded-lg border border-border/80 px-3 text-[13px] font-medium hover:bg-foreground/[0.03]">
          Spreadsheet
        </DownloadLink>
      </PageHeader>
      <ReportHelp>{help}</ReportHelp>
      <DateRangeFilter startDate={startDate} endDate={endDate} onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }} />

      <div className="@container">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/60 @2xl:grid-cols-4">
          {[
            { label: "Sales before tax", value: formatMoney(total) },
            { label: "Tax charged", value: formatMoney(tax) },
            { label: countLabel, value: formatCount(count) },
            { label: `Top ${nameLabel.toLowerCase()}`, value: top ? top.name : "—", note: top && total ? `${Math.round((top.net / total) * 100)}% of sales` : undefined },
          ].map((m) => (
            <div key={m.label} className="min-w-0 bg-card px-4 py-3">
              <p className="truncate text-[12.5px] text-muted-foreground">{m.label}</p>
              <p className="mt-1.5 truncate text-[19px] font-semibold tabular-nums tracking-[-0.02em]">{m.value}</p>
              {m.note && <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{m.note}</p>}
            </div>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 py-12 text-center text-[13px] text-muted-foreground">
          No sales were invoiced in this period.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/80">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="h-9 border-b border-border/60 bg-foreground/[0.02] text-[12px] text-muted-foreground">
                <th className="px-4 text-left font-medium">{nameLabel}</th>
                <th className="w-[28%] px-3 text-left font-medium">Share of sales</th>
                <th className="w-24 px-3 text-right font-medium">{countLabel}</th>
                <th className="w-32 px-3 text-right font-medium">Before tax</th>
                <th className="w-28 px-3 text-right font-medium">Tax</th>
                <th className="w-32 px-4 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const share = total ? (r.net / total) * 100 : 0;
                return (
                  <tr key={r.key} className="h-10 border-b border-border/50 last:border-0">
                    <td className="max-w-[260px] truncate px-4">
                      {r.code && <span className="mr-2 font-mono text-[12px] text-muted-foreground">{r.code}</span>}
                      {r.href ? (
                        <Link href={r.href} className="font-medium hover:underline">{r.name}</Link>
                      ) : (
                        <span className="font-medium">{r.name}</span>
                      )}
                    </td>
                    <td className="px-3">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                          <span className="block h-full rounded-full bg-foreground/60" style={{ width: `${Math.max(share, 0.5)}%` }} />
                        </span>
                        <span className="w-10 text-right text-[12px] tabular-nums text-muted-foreground">{share.toFixed(share < 10 ? 1 : 0)}%</span>
                      </span>
                    </td>
                    <td className="px-3 text-right tabular-nums text-foreground/80">{formatCount(r.count)}</td>
                    <td className="px-3 text-right tabular-nums font-medium">{formatMoney(r.net)}</td>
                    <td className="px-3 text-right tabular-nums text-muted-foreground">{formatMoney(r.tax)}</td>
                    <td className="px-4 text-right tabular-nums">{formatMoney(r.gross)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="h-10 border-t border-border/80 bg-foreground/[0.02] font-semibold">
                <td className="px-4">Total</td>
                <td />
                <td className="px-3 text-right tabular-nums">{formatCount(count)}</td>
                <td className="px-3 text-right tabular-nums">{formatMoney(total)}</td>
                <td className="px-3 text-right tabular-nums">{formatMoney(tax)}</td>
                <td className="px-4 text-right tabular-nums">{formatMoney(total + tax)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-[12px] text-muted-foreground">
        Counts invoices you&apos;ve issued in the period (not drafts or cancelled ones), dated by issue date.
      </p>
    </ContentReveal>
  );
}

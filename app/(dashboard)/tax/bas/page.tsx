"use client";

import { useState } from "react";
import { ArrowUpRight, ArrowDownLeft, Printer } from "lucide-react";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { ExportButton } from "@/components/dashboard/export-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useApi } from "@/lib/query/use-api";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface BasField {
  field: string;
  label: string;
  amount: number;
}

const GST_FIELDS = ["G1", "G2", "G3", "G10", "G11", "1A", "1B"];
const KEY_FIELD = "NET";

function getFieldSection(field: string): string {
  if (GST_FIELDS.includes(field)) return "gst";
  if (field === "NET") return "net";
  return "other";
}

export default function BasPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  // null = the organization's GST accounting method (Settings), until the user picks one.
  const [basisChoice, setBasis] = useState<"accrual" | "cash" | null>(null);
  const params = new URLSearchParams({ startDate, endDate });
  if (basisChoice) params.set("basis", basisChoice);
  const { data, loading } = useApi<{ fields?: BasField[]; basis?: "accrual" | "cash"; currency?: string }>(`/api/v1/reports/bas?${params}`, { keepPrevious: true });
  const fields = data?.fields || [];
  const basis = basisChoice ?? data?.basis ?? "accrual";
  const currency = data?.currency || "AUD";
  const money = (cents: number) => formatMoney(cents, currency);
  useDocumentTitle("Tax · BAS");

  const gstOnSales = fields.find((f) => f.field === "1A")?.amount || 0;
  const gstOnPurchases = fields.find((f) => f.field === "1B")?.amount || 0;
  const netGst = fields.find((f) => f.field === "NET")?.amount || 0;
  const maxGst = Math.max(Math.abs(gstOnSales), Math.abs(gstOnPurchases), 1);
  const salesPct = (Math.abs(gstOnSales) / maxGst) * 100;
  const purchasesPct = (Math.abs(gstOnPurchases) / maxGst) * 100;

  const gstFields = fields.filter((f) => getFieldSection(f.field) === "gst");
  const netField = fields.find((f) => f.field === KEY_FIELD);
  const otherFields = fields.filter((f) => getFieldSection(f.field) === "other");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Activity Statement"
        description="Australian BAS report with GST calculations."
      >
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Print
        </Button>
        <ExportButton
          data={fields.map((f) => ({ field: f.field, description: f.label, amount: f.amount }))}
          columns={["field", "description", "amount"]}
          moneyColumns={["amount"]}
          filename="bas"
        />
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" asChild>
          <Link href="/tax/periods">
            <ArrowUpRight className="size-3.5" />
            Tax Periods
          </Link>
        </Button>
      </PageHeader>

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      <div className="space-y-1.5 rounded-lg border bg-card p-4">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Count GST</p>
        <div className="inline-flex rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={basis === "accrual" ? "secondary" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setBasis("accrual")}
          >
            When you record it
          </Button>
          <Button
            type="button"
            size="sm"
            variant={basis === "cash" ? "secondary" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setBasis("cash")}
          >
            When money moves
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {basis === "accrual"
            ? "Non-cash basis: counts GST on the date of the invoice or bill."
            : "Cash basis: counts GST when invoices and bills are paid, in proportion to each payment."}
        </p>
      </div>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <ContentReveal className="space-y-6">
          {/* GST comparison */}
          <div className="rounded-lg border bg-card p-5">
            <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              GST on Sales vs Purchases
            </h3>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="size-3.5 text-blue-500" />
                    <span className="text-muted-foreground">GST on Sales (1A)</span>
                  </div>
                  <span className="font-mono text-sm tabular-nums font-medium text-blue-600 dark:text-blue-400">
                    {money(gstOnSales)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${salesPct}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <ArrowDownLeft className="size-3.5 text-orange-500" />
                    <span className="text-muted-foreground">GST on Purchases (1B)</span>
                  </div>
                  <span className="font-mono text-sm tabular-nums font-medium text-orange-600 dark:text-orange-400">
                    {money(gstOnPurchases)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all"
                    style={{ width: `${purchasesPct}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm font-medium">
                  {netGst >= 0 ? "Net GST Payable" : "Net GST Refund"}
                </span>
                <span className={cn(
                  "font-mono text-sm tabular-nums font-semibold",
                  netGst >= 0 ? "text-red-600 dark:text-red-400" : "text-brand-600 dark:text-brand-400"
                )}>
                  {money(Math.abs(netGst))}
                </span>
              </div>
            </div>
          </div>

          {/* Net result hero */}
          {netField && (
            <div className={cn(
              "rounded-xl border-2 p-5",
              netField.amount >= 0
                ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20"
                : "border-brand-200 bg-brand-50/60 dark:border-brand-900 dark:bg-brand-950/20"
            )}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                    {netField.amount < 0 ? "Refund Due from ATO" : "Amount Payable to ATO"}
                  </p>
                  <p className={cn(
                    "mt-1 text-2xl font-bold font-mono tabular-nums",
                    netField.amount >= 0 ? "text-red-600 dark:text-red-400" : "text-brand-600 dark:text-brand-400"
                  )}>
                    {money(Math.abs(netField.amount))}
                  </p>
                </div>
                <div className={cn(
                  "flex size-12 items-center justify-center rounded-xl",
                  netField.amount >= 0
                    ? "bg-red-100 dark:bg-red-900/40"
                    : "bg-brand-100 dark:bg-brand-900/40"
                )}>
                  {netField.amount >= 0 ? (
                    <ArrowUpRight className="size-5 text-red-600 dark:text-red-400" />
                  ) : (
                    <ArrowDownLeft className="size-5 text-brand-600 dark:text-brand-400" />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* GST fields */}
          {gstFields.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">GST Information</h3>
                <Badge variant="outline" className="text-[10px]">G1-G11, 1A-1B</Badge>
              </div>
              <div className="rounded-lg border overflow-hidden">
                {gstFields.map((f, i) => {
                  const isGstTotal = f.field === "1A" || f.field === "1B";
                  return (
                    <div
                      key={f.field}
                      className={cn(
                        "flex items-center justify-between px-4 py-3.5",
                        i < gstFields.length - 1 && "border-b",
                        isGstTotal && "bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "flex size-8 items-center justify-center rounded-md text-[10px] font-bold font-mono",
                          isGstTotal
                            ? "bg-blue-600 text-white dark:bg-blue-500"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {f.field}
                        </div>
                        <p className={cn("text-sm", isGstTotal && "font-medium")}>{f.label}</p>
                      </div>
                      <span className={cn(
                        "font-mono text-sm tabular-nums font-medium",
                        f.field === "1A" && "text-blue-600 dark:text-blue-400",
                        f.field === "1B" && "text-orange-600 dark:text-orange-400"
                      )}>
                        {money(f.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Other obligations */}
          {otherFields.length > 0 && (
            <div>
              <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Other Obligations</h3>
              <div className="rounded-lg border overflow-hidden">
                {otherFields.map((f, i) => (
                  <div
                    key={f.field}
                    className={cn(
                      "flex items-center justify-between px-4 py-3.5",
                      i < otherFields.length - 1 && "border-b"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-md bg-muted text-[10px] font-bold font-mono text-muted-foreground">
                        {f.field}
                      </div>
                      <p className="text-sm">{f.label}</p>
                    </div>
                    <span className="font-mono text-sm tabular-nums font-medium">{money(f.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ContentReveal>
      )}
    </div>
  );
}

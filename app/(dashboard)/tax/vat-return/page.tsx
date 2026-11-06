"use client";

import { useState, useCallback } from "react";
import { ArrowUpRight, ArrowDownLeft, Printer, ChevronDown, ChevronRight } from "lucide-react";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { ExportButton } from "@/components/dashboard/export-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useApi } from "@/lib/query/use-api";
import Link from "next/link";

interface VatBox {
  box: string;
  label: string;
  amount: number;
}

interface BoxTransaction {
  journalLineId: string;
  journalEntryId: string;
  entryNumber: number;
  date: string;
  description: string | null;
  reference: string | null;
  sourceType: string | null;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  amount: number;
}

const CALCULATED_BOXES = ["3", "5"];
const KEY_BOX = "5";
// Boxes backed by control-account journal lines (drillable via the
// /transactions endpoint). Mirrors BOX_ACCOUNT in lib/reports/tax-return.ts.
const DRILLABLE_BOXES = ["1", "2", "4"];

type Basis = "accrual" | "cash";

export default function VatReturnPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  // null = the organization's VAT scheme (Settings), until the user picks one.
  const [basisChoice, setBasis] = useState<Basis | null>(null);
  // Flat-rate scheme percentage as the user types it (e.g. "14.5"). Empty = off.
  const [flatRatePercent, setFlatRatePercent] = useState("");
  const [flatRateOn, setFlatRateOn] = useState(false);
  // Per-box drill-down: which box is open, for which period/basis.
  const [opened, setOpened] = useState<{ box: string; period: string } | null>(null);
  useDocumentTitle("Tax · VAT Return");

  const params = new URLSearchParams({ startDate, endDate });
  if (basisChoice) params.set("basis", basisChoice);
  // The API takes the flat rate in basis points (1450 = 14.5%). Only send it
  // when the scheme is switched on and a positive percentage is entered.
  const pct = Number(flatRatePercent);
  const flatRate = flatRateOn && Number.isFinite(pct) && pct > 0;
  if (flatRate) {
    params.set("flatRatePercent", String(Math.round(pct * 100)));
  }
  // The flat rate follows typing, so those answers aren't remembered for prefetching.
  const { data, loading } = useApi<{ boxes?: VatBox[]; basis?: Basis; currency?: string }>(`/api/v1/reports/vat-return?${params}`, { keepPrevious: true, learn: !flatRate });
  const boxes = data?.boxes || [];
  const basis: Basis = basisChoice ?? data?.basis ?? "accrual";
  const currency = data?.currency || "USD";
  const money = (cents: number) => formatMoney(cents, currency);

  // Any change to the period/basis closes the drill-down.
  const period = `${startDate}|${endDate}|${basis}`;
  const openBox = opened?.period === period ? opened.box : null;
  const { data: drillJson, loading: drillLoading } = useApi<{ transactions?: BoxTransaction[] }>(
    openBox ? `/api/v1/reports/vat-return/transactions?${new URLSearchParams({ box: openBox, startDate, endDate, basis })}` : null
  );
  const drillRows = drillJson ? drillJson.transactions || [] : undefined;

  const toggleDrill = useCallback(
    (box: string) => {
      setOpened(openBox === box ? null : { box, period });
    },
    [openBox, period]
  );

  const outputVat = boxes.find((b) => b.box === "1")?.amount || 0;
  const inputVat = boxes.find((b) => b.box === "4")?.amount || 0;
  const netVat = boxes.find((b) => b.box === "5")?.amount || 0;
  const maxVat = Math.max(Math.abs(outputVat), Math.abs(inputVat), 1);
  const outputPct = (Math.abs(outputVat) / maxVat) * 100;
  const inputPct = (Math.abs(inputVat) / maxVat) * 100;

  return (
    <div className="space-y-6">
      <PageHeader
        title="VAT Return"
        description="UK/EU VAT return calculation with HMRC boxes 1-9."
      >
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Print
        </Button>
        <ExportButton
          data={boxes.map((b) => ({ box: b.box, description: b.label, amount: b.amount }))}
          columns={["box", "description", "amount"]}
          moneyColumns={["amount"]}
          filename="vat-return"
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

      {/* How VAT is counted, plus optional flat-rate scheme */}
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <Label className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Count VAT
          </Label>
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
              ? "Counts VAT on the date you raise or enter a document."
              : "Counts VAT when invoices and bills are paid, in proportion to each payment."}
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Switch
              id="flat-rate-toggle"
              checked={flatRateOn}
              onCheckedChange={setFlatRateOn}
            />
            <Label htmlFor="flat-rate-toggle" className="text-sm font-medium">
              Use a flat rate
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              max="100"
              disabled={!flatRateOn}
              value={flatRatePercent}
              onChange={(e) => setFlatRatePercent(e.target.value)}
              placeholder="e.g. 14.5"
              className="h-8 w-28 text-sm"
              aria-label="Flat rate percentage"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Pay a fixed percentage of your total sales instead of working out
            VAT line by line.
          </p>
        </div>
      </div>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <ContentReveal className="space-y-6">
          {/* Output vs Input comparison */}
          <div className="rounded-lg border bg-card p-5">
            <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Output vs Input VAT
            </h3>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="size-3.5 text-blue-500" />
                    <span className="text-muted-foreground">Output VAT (Sales)</span>
                  </div>
                  <span className="font-mono text-sm tabular-nums font-medium">
                    {money(outputVat)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${outputPct}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <ArrowDownLeft className="size-3.5 text-orange-500" />
                    <span className="text-muted-foreground">Input VAT (Purchases)</span>
                  </div>
                  <span className="font-mono text-sm tabular-nums font-medium">
                    {money(inputVat)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all"
                    style={{ width: `${inputPct}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm font-medium">
                  {netVat >= 0 ? "Net VAT Due" : "Net VAT Refund"}
                </span>
                <span className={cn(
                  "font-mono text-sm tabular-nums font-semibold",
                  netVat >= 0 ? "text-red-600 dark:text-red-400" : "text-brand-600 dark:text-brand-400"
                )}>
                  {money(Math.abs(netVat))}
                </span>
              </div>
            </div>
          </div>

          {/* Net result hero */}
          <div className={cn(
            "rounded-xl border-2 p-5",
            netVat >= 0
              ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20"
              : "border-brand-200 bg-brand-50/60 dark:border-brand-900 dark:bg-brand-950/20"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                  Box 5 · {netVat >= 0 ? "Amount Due to HMRC" : "Refund Due to You"}
                </p>
                <p className={cn(
                  "mt-1 text-2xl font-bold font-mono tabular-nums",
                  netVat >= 0 ? "text-red-600 dark:text-red-400" : "text-brand-600 dark:text-brand-400"
                )}>
                  {money(Math.abs(netVat))}
                </p>
              </div>
              <div className={cn(
                "flex size-12 items-center justify-center rounded-xl",
                netVat >= 0
                  ? "bg-red-100 dark:bg-red-900/40"
                  : "bg-brand-100 dark:bg-brand-900/40"
              )}>
                {netVat >= 0 ? (
                  <ArrowUpRight className="size-5 text-red-600 dark:text-red-400" />
                ) : (
                  <ArrowDownLeft className="size-5 text-brand-600 dark:text-brand-400" />
                )}
              </div>
            </div>
          </div>

          {/* Box breakdown */}
          <div>
            <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
              All Boxes
            </h3>
            <p className="text-[11px] text-muted-foreground mb-2">
              Tap Box 1, 2 or 4 to see the transactions behind the figure.
            </p>
            <div className="rounded-lg border overflow-hidden">
              {boxes.map((b, i) => {
                const isKey = b.box === KEY_BOX;
                const isCalc = CALCULATED_BOXES.includes(b.box);
                const isDrillable = DRILLABLE_BOXES.includes(b.box);
                const isOpen = openBox === b.box;
                const rows = isOpen ? drillRows : undefined;
                const isDrillLoading = isOpen && drillLoading;

                const rowInner = (
                  <>
                    <div className="flex items-center gap-3">
                      {isDrillable && (
                        isOpen ? (
                          <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                        )
                      )}
                      <div className={cn(
                        "flex size-8 items-center justify-center rounded-md text-xs font-bold font-mono",
                        isKey
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {b.box}
                      </div>
                      <div>
                        <p className={cn("text-sm", isKey && "font-semibold")}>{b.label}</p>
                        {isCalc && (
                          <Badge variant="outline" className="text-[9px] mt-0.5">Calculated</Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "font-mono text-sm tabular-nums",
                        isKey && "text-base font-bold",
                        isKey && netVat >= 0 && "text-red-600 dark:text-red-400",
                        isKey && netVat < 0 && "text-brand-600 dark:text-brand-400",
                        !isKey && "font-medium"
                      )}>
                        {money(Math.abs(b.amount))}
                      </p>
                    </div>
                  </>
                );

                return (
                  <div
                    key={b.box}
                    className={cn(
                      i < boxes.length - 1 && "border-b",
                      isKey && "bg-brand-50/60 dark:bg-brand-950/20",
                      isCalc && !isKey && "bg-muted/30"
                    )}
                  >
                    {isDrillable ? (
                      <button
                        type="button"
                        onClick={() => toggleDrill(b.box)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
                      >
                        {rowInner}
                      </button>
                    ) : (
                      <div className="flex items-center justify-between px-4 py-3.5">
                        {rowInner}
                      </div>
                    )}

                    {isDrillable && isOpen && (
                      <div className="border-t bg-muted/20 px-4 py-3">
                        {isDrillLoading ? (
                          <p className="py-2 text-xs text-muted-foreground">Loading transactions…</p>
                        ) : !rows || rows.length === 0 ? (
                          <p className="py-2 text-xs text-muted-foreground">
                            No transactions contribute to this box for the selected period.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-muted-foreground">
                                  <th className="py-1.5 pr-3 font-medium">Date</th>
                                  <th className="py-1.5 pr-3 font-medium">Entry</th>
                                  <th className="py-1.5 pr-3 font-medium">Description</th>
                                  <th className="py-1.5 pr-3 font-medium">Reference</th>
                                  <th className="py-1.5 pl-3 text-right font-medium">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((t, ti) => (
                                  <tr key={`${t.journalLineId}-${ti}`} className="border-t border-border/60">
                                    <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">{t.date}</td>
                                    <td className="py-1.5 pr-3 whitespace-nowrap font-mono">
                                      #{t.entryNumber}
                                    </td>
                                    <td className="py-1.5 pr-3">{t.description || "—"}</td>
                                    <td className="py-1.5 pr-3 text-muted-foreground">{t.reference || "—"}</td>
                                    <td className="py-1.5 pl-3 text-right font-mono tabular-nums">
                                      {money(t.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-border font-medium">
                                  <td className="py-1.5 pr-3" colSpan={4}>
                                    Total ({rows.length} {rows.length === 1 ? "line" : "lines"})
                                  </td>
                                  <td className="py-1.5 pl-3 text-right font-mono tabular-nums">
                                    {money(rows.reduce((s, t) => s + t.amount, 0))}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </ContentReveal>
      )}
    </div>
  );
}

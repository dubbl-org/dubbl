"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Download, AlertTriangle } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ReportSkeleton } from "@/components/dashboard/skeletons";
import { ContentReveal } from "@/components/shared/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { BackToReports, ReportHelp, BasisToggle } from "@/app/(dashboard)/reports/_components";

interface ComputedBox {
  box: string;
  label: string;
  help?: string;
  amount: number;
  /** "accounts" = summed by account type/tag, "schedule" = tax-basis workpaper. */
  source: "ledger" | "documents" | "derived" | "manual" | "accounts" | "schedule";
  optional?: boolean;
  /** Part of the printed form this line belongs to. */
  section?: string;
}

interface Reconciliation {
  label: string;
  returnAmount: number;
  ledgerAmount: number;
  delta: number;
  note?: string;
}

interface ReturnResponse {
  kind: string;
  title: string;
  authority: string;
  country: string;
  currency: string;
  basis: string;
  period: { startDate: string; endDate: string };
  boxes: ComputedBox[];
  reconciliation: Reconciliation[];
  rateWarnings: string[];
  availableKinds: { kind: string; title: string; bases: string[] }[];
}

interface BoxTransaction {
  journalLineId: string;
  journalEntryId: string;
  entryNumber: number;
  date: string;
  description: string | null;
  debit: number;
  credit: number;
  amount: number;
}

const SOURCE_LABEL: Record<ComputedBox["source"], string> = {
  ledger: "From the ledger",
  documents: "From your invoices and bills",
  derived: "Calculated from the boxes above",
  manual: "You key this in from your records",
  accounts: "From your chart of accounts",
  schedule: "From the tax computation workpaper",
};

/**
 * Group rows into the printed form's parts. Rows keep the module's order, so a
 * section is one run of consecutive rows that share it.
 */
function groupBySection(boxes: ComputedBox[]) {
  const groups: { section?: string; rows: ComputedBox[] }[] = [];
  for (const row of boxes) {
    const last = groups[groups.length - 1];
    if (last && last.section === row.section) last.rows.push(row);
    else groups.push({ section: row.section, rows: [row] });
  }
  return groups;
}

/** Real box numbers print as they are; named keys fall back to the item number. */
function boxNumber(box: string, position: number) {
  return /^[\dA-Z]{1,3}$/.test(box) ? box : String(position);
}

/**
 * One page for every periodic return the org's jurisdiction files. The boxes,
 * labels and help text come from the module (lib/tax/modules), so a new country
 * needs no UI change.
 */
export default function TaxReturnPage({
  initialData,
  kind,
}: {
  initialData: Record<string, unknown> | null;
  kind: string;
}) {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");
  const [data, setData] = useState<ReturnResponse | null>(
    (initialData as unknown as ReturnResponse)?.boxes ? (initialData as unknown as ReturnResponse) : null
  );
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drill, setDrill] = useState<
    Record<string, { loading: boolean; rows: BoxTransaction[]; error?: string }>
  >({});
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return; // the server rendered the default query
    }
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ kind, startDate, endDate, basis });
    fetch(`/api/v1/reports/tax-return?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d.boxes ? d : null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, startDate, endDate, basis]);

  function toggle(box: string, source: ComputedBox["source"]) {
    const opening = !expanded.has(box);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(box)) next.delete(box);
      else next.add(box);
      return next;
    });
    // Only control-account boxes have journal lines behind them.
    if (opening && source === "ledger" && !drill[box]) {
      const orgId = localStorage.getItem("activeOrgId");
      if (!orgId) return;
      setDrill((prev) => ({ ...prev, [box]: { loading: true, rows: [] } }));
      const params = new URLSearchParams({ kind, box, startDate, endDate, basis });
      fetch(`/api/v1/reports/tax-return/transactions?${params}`, {
        headers: { "x-organization-id": orgId },
      })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "Could not load the lines");
          return d;
        })
        .then((d) =>
          setDrill((prev) => ({
            ...prev,
            [box]: { loading: false, rows: d.transactions ?? [] },
          }))
        )
        .catch((e) =>
          setDrill((prev) => ({
            ...prev,
            [box]: { loading: false, rows: [], error: e.message },
          }))
        );
    }
  }

  // The breadcrumb reads the module's name for this return, not the URL slug.
  useEntityTitle(data?.title);

  const money = (amount: number) => formatMoney(amount, data?.currency ?? "USD");
  const supportsCash = data?.availableKinds.find((k) => k.kind === kind)?.bases.includes("cash");
  const workpaperParams = new URLSearchParams({ kind, startDate, endDate, basis, format: "xlsx" });

  if (loading && !data) return <ReportSkeleton />;

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />

      <PageHeader
        title={data?.title ?? "Tax return"}
        description={
          data
            ? `${data.authority} · ${data.country} · filed in ${data.currency}`
            : "The figures for your tax return, box by box."
        }
      >
        <div className="flex gap-2">
          <a
            href={`/api/v1/reports/tax-return?${workpaperParams}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            <Download className="size-3.5" />
            Workpaper
          </a>
          <a
            href={`/api/v1/reports/tax-return?${new URLSearchParams({ kind, startDate, endDate, basis })}`}
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            Raw figures
          </a>
        </div>
      </PageHeader>

      <ReportHelp>
        These are the numbers you or your accountant key into {data?.authority ?? "the authority"}. Open a box to
        read what it means, where the figure came from, and what sits behind it.
      </ReportHelp>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onDateChange={(s, e) => {
            setStartDate(s);
            setEndDate(e);
          }}
        />
        {supportsCash && <BasisToggle basis={basis} onChange={setBasis} />}
      </div>

      {data && data.rateWarnings.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/20">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium">Check these rates before filing</p>
            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
              {data.rateWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {loading ? (
        <BrandLoader className="h-48" />
      ) : !data ? (
        <p className="text-sm text-muted-foreground">No figures for this period.</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border bg-card">
            {/* Form header: what is being filed, for which period, in what currency. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b bg-muted/40 px-4 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {data.authority} · {data.title}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {data.period.startDate} – {data.period.endDate} · {data.currency} · {data.basis}
              </p>
            </div>

            {groupBySection(data.boxes).map((group, groupIndex) => (
              <div key={group.section ?? groupIndex}>
                {group.section && (
                  <p className="border-b border-border/70 bg-muted/20 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {group.section}
                  </p>
                )}
                {group.rows.map((b) => {
                  const isOpen = expanded.has(b.box);
                  // A derived line is a subtotal on every form: it reads heavier,
                  // so the eye lands on the figure the authority asks for.
                  const isTotal = b.source === "derived";
                  const blank = b.source === "manual" && b.amount === 0;
                  return (
                    <div
                      key={b.box}
                      className={cn(
                        "border-t border-border/60 first:border-t-0",
                        isTotal && "border-border bg-muted/40"
                      )}
                    >
                      <button
                        onClick={() => toggle(b.box, b.source)}
                        aria-expanded={isOpen}
                        className="group flex w-full items-stretch text-left transition-colors hover:bg-muted/40"
                      >
                        <span className="flex w-11 shrink-0 items-center justify-center border-r border-border/60 font-mono text-[11px] text-muted-foreground tabular-nums">
                          {boxNumber(b.box, data.boxes.indexOf(b) + 1)}
                        </span>
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 py-2.5 pl-2 pr-3">
                          <ChevronRight
                            className={cn(
                              "size-3.5 shrink-0 text-muted-foreground/40 transition-transform group-hover:text-muted-foreground",
                              isOpen && "rotate-90 text-muted-foreground"
                            )}
                          />
                          <span className={cn("truncate text-[13px]", isTotal && "font-semibold")}>
                            {b.label}
                          </span>
                          {b.optional && b.amount === 0 && (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                              optional
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            "flex w-32 shrink-0 items-center justify-end border-l border-border/60 px-3 py-2.5 font-mono text-[13px] tabular-nums sm:w-40",
                            isTotal && "font-semibold"
                          )}
                        >
                          {blank ? (
                            <span className="font-sans text-[11px] text-muted-foreground/70">to key in</span>
                          ) : (
                            money(b.amount)
                          )}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="space-y-2 border-t border-border/60 bg-background px-4 py-3 text-sm text-muted-foreground sm:pl-[4.5rem]">
                          {b.help && <p>{b.help}</p>}
                          <p className="text-xs">Source: {SOURCE_LABEL[b.source]}</p>
                          {b.source === "ledger" && (
                            <div className="pt-1">
                              {drill[b.box]?.loading ? (
                                <BrandLoader className="h-16" />
                              ) : drill[b.box]?.error ? (
                                <p className="text-xs text-amber-600">{drill[b.box].error}</p>
                              ) : drill[b.box] && drill[b.box].rows.length > 0 ? (
                                <div className="divide-y rounded-md border bg-background">
                                  {drill[b.box].rows.slice(0, 50).map((t) => (
                                    <div
                                      key={t.journalLineId}
                                      className="flex items-center justify-between gap-3 px-2 py-1.5 text-xs"
                                    >
                                      <span className="truncate">
                                        {t.date} · #{t.entryNumber} · {t.description ?? "—"}
                                      </span>
                                      <span className="shrink-0 font-mono tabular-nums">
                                        {money(t.amount)}
                                      </span>
                                    </div>
                                  ))}
                                  {drill[b.box].rows.length > 50 && (
                                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                      Showing the first 50 of {drill[b.box].rows.length} lines.
                                    </p>
                                  )}
                                </div>
                              ) : drill[b.box] ? (
                                <p className="text-xs">No lines in this period.</p>
                              ) : null}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {data.reconciliation.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium">Reconciliation</h2>
              <p className="text-xs text-muted-foreground">
                Supply and purchase figures come from your documents; tax comes from the ledger. Where the two
                disagree, this is the difference — nothing is adjusted automatically.
              </p>
              <div className="divide-y rounded-lg border">
                {data.reconciliation.map((r) => (
                  <div key={r.label} className="grid gap-1 px-3 py-3 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-4">
                    <div>
                      <p>{r.label}</p>
                      {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
                    </div>
                    <span className="font-mono tabular-nums">{money(r.returnAmount)}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">{money(r.ledgerAmount)}</span>
                    <span
                      className={`font-mono tabular-nums ${
                        r.delta === 0 ? "text-muted-foreground" : "text-amber-600"
                      }`}
                    >
                      {r.delta > 0 ? "+" : ""}
                      {money(r.delta)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </ContentReveal>
  );
}

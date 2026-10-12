"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { PartyCell, StatusPill } from "./cells";
import type { ExplorerStatus } from "./types";

export interface PreviewLine {
  description?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  amount?: number | null;
  taxAmount?: number | null;
}

export interface PreviewDoc {
  lines?: PreviewLine[];
  notes?: string | null;
  totals?: { label: string; cents: number | null | undefined; strong?: boolean; tone?: string }[];
  /** Anything else worth showing under the lines, such as payments received. */
  extra?: ReactNode;
}

/**
 * The right-hand preview for a document with line items: who, how much, the
 * key dates and what was on it. Details load on open from the record's own API.
 */
export function DocumentPreview({
  url,
  pick,
  number,
  plainTitle,
  status,
  statusOptions,
  party,
  partySub,
  amount,
  amountLabel = "Total",
  currency,
  facts,
  actions,
  children,
}: {
  url?: string;
  pick?: (json: Record<string, unknown>) => PreviewDoc;
  number: string;
  /** Show `number` as a plain title instead of a monospace document number. */
  plainTitle?: boolean;
  status?: string;
  statusOptions?: ExplorerStatus[];
  party?: string | null;
  partySub?: string | null;
  amount?: number | null;
  amountLabel?: string;
  currency?: string | null;
  facts: { label: string; value: ReactNode }[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const [doc, setDoc] = useState<{ url: string; data: PreviewDoc } | null>(null);
  const loading = Boolean(url && pick) && doc?.url !== url;

  useEffect(() => {
    if (!url || !pick) return;
    let cancelled = false;
    const orgId = localStorage.getItem("activeOrgId");
    fetch(url, { headers: orgId ? { "x-organization-id": orgId } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) setDoc({ url, data: json ? pick(json) : {} });
      })
      .catch(() => {
        if (!cancelled) setDoc({ url, data: {} });
      });
    return () => {
      cancelled = true;
    };
    // `pick` is a pure mapper defined alongside the page config
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const money = (c: number | null | undefined) => formatMoney(c ?? 0, currency || "USD");
  const data = doc && doc.url === url ? doc.data : null;

  return (
    <div className="px-5 pb-8 pt-5">
      <div className="flex items-center gap-2">
        <span className={plainTitle ? "text-[14px] font-medium" : "font-mono text-[13px] text-muted-foreground"}>{number}</span>
        {status && statusOptions && <StatusPill value={status} options={statusOptions} />}
      </div>
      {amount != null && (
        <p className="mt-2 text-[28px] font-semibold tabular-nums tracking-[-0.025em]">
          {money(amount)}
          <span className="ml-2 text-[13px] font-normal tracking-normal text-muted-foreground">{amountLabel}</span>
        </p>
      )}
      {party !== undefined && (
        <div className="mt-3 text-[13.5px]">
          <PartyCell name={party} sub={partySub} />
        </div>
      )}
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border/80 p-4">
        {facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-[12px] text-muted-foreground">{f.label}</dt>
            <dd className="mt-0.5 truncate text-[13px] font-medium">{f.value ?? "—"}</dd>
          </div>
        ))}
      </dl>

      {url && pick && (
        <div className="mt-6">
          {(loading || data?.lines !== undefined) && <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Line items</p>}
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-2/3" />
            </div>
          ) : data?.lines && data.lines.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border/80">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="h-8 bg-foreground/[0.025] text-[11.5px] text-muted-foreground">
                    <th className="px-3 text-left font-medium">Item</th>
                    <th className="w-14 px-2 text-right font-medium">Qty</th>
                    <th className="w-24 px-2 text-right font-medium">Price</th>
                    <th className="w-28 px-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l, i) => (
                    <tr key={i} className="border-t border-border/60 align-top">
                      <td className="px-3 py-2">{l.description || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{l.quantity != null ? +(l.quantity / 100).toFixed(2) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{l.unitPrice != null ? money(l.unitPrice) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.amount != null ? money(l.amount) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.totals && (
                <div className="space-y-1 border-t border-border/80 bg-foreground/[0.015] px-3 py-2.5">
                  {data.totals.map((t) => (
                    <div key={t.label} className={cn("flex justify-between text-[13px]", t.strong ? "font-semibold" : "text-muted-foreground")}>
                      <span>{t.label}</span>
                      <span className="tabular-nums" style={t.tone ? { color: t.tone } : undefined}>{money(t.cents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : data?.lines !== undefined ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">No line items</p>
          ) : null}
          {data?.extra}
          {data?.notes && (
            <div className="mt-5">
              <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{data.notes}</p>
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

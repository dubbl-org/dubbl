"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatDay } from "@/components/dashboard/explorer/cells";

export interface Aging {
  current: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  over90: number;
}

const BUCKETS: { key: keyof Aging; label: string; color: string }[] = [
  { key: "current", label: "Not due", color: "#A1A1AA" },
  { key: "d1to30", label: "1–30d late", color: "#F59E0B" },
  { key: "d31to60", label: "31–60d", color: "#F97316" },
  { key: "d61to90", label: "61–90d", color: "#EF4444" },
  { key: "over90", label: "90d+", color: "#B91C1C" },
];

/** One row of GET /api/v1/contacts/balances. Amounts in cents. */
export interface BalanceRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: "customer" | "supplier" | "both";
  currencyCode: string | null;
  paymentTermsDays: number | null;
  creditLimit: number | null;
  is1099Vendor: boolean;
  createdAt: string;
  outstanding: number;
  overdue: number;
  openCount: number;
  overdueCount: number;
  oldestOverdueDate: string | null;
  aging: Aging;
  lastDocumentDate: string | null;
  totalThisYear: number;
  totalLastYear: number;
  lastPaymentDate: string | null;
  paidCount: number;
  avgDaysToPay: number | null;
  unappliedCredit: number;
  hasPortalAccess: boolean;
}

/** Where an open balance sits by days past due, as one stacked bar. */
export function AgingBar({ aging, currency, title = "How late it is" }: { aging: Aging; currency?: string | null; title?: string }) {
  const total = BUCKETS.reduce((s, b) => s + Math.max(0, aging[b.key]), 0);
  if (total <= 0) return null;
  return (
    <div className="mt-6">
      <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">{title}</p>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-foreground/[0.05]">
        {BUCKETS.map((b) =>
          aging[b.key] > 0 ? <span key={b.key} style={{ width: `${(aging[b.key] / total) * 100}%`, backgroundColor: b.color }} /> : null
        )}
      </div>
      <dl className="mt-3 grid grid-cols-5 gap-2">
        {BUCKETS.map((b) => (
          <div key={b.key} className="min-w-0">
            <dt className="flex items-center gap-1 truncate text-[11.5px] text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
              {b.label}
            </dt>
            <dd className={cn("mt-0.5 truncate text-[12.5px] font-medium tabular-nums", aging[b.key] === 0 && "text-muted-foreground/60")}>
              {formatMoney(aging[b.key], currency || "USD")}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** "Over 90 days" etc. for the oldest bucket holding money. */
export function agingBucketLabel(aging: Aging, outstanding: number) {
  if (aging.over90 > 0) return "Over 90 days late";
  if (aging.d61to90 > 0) return "61–90 days late";
  if (aging.d31to60 > 0) return "31–60 days late";
  if (aging.d1to30 > 0) return "1–30 days late";
  return outstanding > 0 ? "Not yet due" : "Nothing owed";
}

interface StatementLine {
  date: string;
  type: string;
  documentNumber: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface Statement {
  openingBalance: number;
  closingBalance: number;
  transactions: StatementLine[];
}

const TYPE: Record<string, string> = {
  invoice: "Invoice",
  credit_note: "Credit note",
  payment: "Payment",
  bill: "Bill",
  debit_note: "Supplier credit",
};

/**
 * The statement a contact would receive: opening balance, the latest lines with
 * a running balance, closing balance. Suppliers use the payables statement,
 * where a positive balance is what you owe them.
 */
export function StatementPreview({
  contactId,
  side,
  startDate,
  endDate,
  currency,
}: {
  contactId: string;
  side: "customer" | "supplier";
  startDate?: string;
  endDate?: string;
  currency?: string | null;
}) {
  const key = `${contactId}:${side}:${startDate}:${endDate}`;
  const [state, setState] = useState<{ key: string; data: Statement | null; error?: string } | null>(null);
  const current = state?.key === key ? state : null;

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const path = side === "customer" ? "statement" : "supplier-statement";
    fetch(`/api/v1/contacts/${contactId}/${path}?${params}`, { headers: { "x-organization-id": orgId } })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (!cancelled) setState({ key, data: r.ok ? (json as Statement) : null, error: r.ok ? undefined : json.error });
      })
      .catch(() => {
        if (!cancelled) setState({ key, data: null, error: "Couldn't load the statement" });
      });
    return () => {
      cancelled = true;
    };
  }, [key, contactId, side, startDate, endDate]);

  const money = (c: number) => formatMoney(c, currency || "USD");
  const lines = current?.data?.transactions ?? [];
  const shown = lines.slice(-10);

  return (
    <div className="mt-6">
      <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">
        Statement{startDate && endDate ? ` · ${formatDay(startDate)} – ${formatDay(endDate)}` : ""}
      </p>
      {!current ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ) : !current.data ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">{current.error || "Couldn't load the statement"}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/80">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="h-8 bg-foreground/[0.025] text-[11.5px] text-muted-foreground">
                <th className="px-3 text-left font-medium">Date</th>
                <th className="px-2 text-left font-medium">Item</th>
                <th className="px-2 text-right font-medium">Amount</th>
                <th className="px-3 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border/60 text-muted-foreground">
                <td className="px-3 py-2" colSpan={3}>
                  Opening balance
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(current.data.openingBalance)}</td>
              </tr>
              {lines.length > shown.length && (
                <tr className="border-t border-border/60 text-muted-foreground">
                  <td className="px-3 py-1.5 text-[11.5px]" colSpan={4}>
                    {lines.length - shown.length} earlier line{lines.length - shown.length === 1 ? "" : "s"}…
                  </td>
                </tr>
              )}
              {shown.map((t, i) => {
                // Customers: invoices add, payments subtract. Suppliers: bills add to what you owe.
                const amount = side === "customer" ? t.debit - t.credit : t.credit - t.debit;
                return (
                  <tr key={i} className="border-t border-border/60">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-foreground/80">{formatDay(t.date)}</td>
                    <td className="max-w-[160px] truncate px-2 py-2">
                      {TYPE[t.type] ?? t.type} <span className="font-mono text-[11.5px] text-muted-foreground">{t.documentNumber}</span>
                    </td>
                    <td className={cn("px-2 py-2 text-right tabular-nums", amount < 0 && "text-emerald-700 dark:text-emerald-400")}>
                      {amount < 0 ? `−${money(-amount)}` : money(amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(t.balance)}</td>
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr className="border-t border-border/60">
                  <td className="px-3 py-4 text-center text-muted-foreground" colSpan={4}>
                    Nothing in this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex justify-between border-t border-border/80 bg-foreground/[0.015] px-3 py-2.5 text-[13px] font-semibold">
            <span>{side === "customer" ? "Closing balance" : "You owe them"}</span>
            <span className="tabular-nums">{money(current.data.closingBalance)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

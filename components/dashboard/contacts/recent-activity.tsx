"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/components/dashboard/explorer/cells";

interface Activity {
  id: string;
  type: "invoice" | "quote" | "credit_note" | "payment" | "bill";
  number: string;
  status: string;
  amount: number;
  currencyCode: string | null;
  date: string;
}

const ACTIVITY: Record<Activity["type"], { label: string; href: (id: string) => string }> = {
  invoice: { label: "Invoice", href: (id) => `/sales/${id}` },
  quote: { label: "Quote", href: (id) => `/sales/quotes/${id}` },
  credit_note: { label: "Credit note", href: (id) => `/sales/credit-notes/${id}` },
  payment: { label: "Payment", href: (id) => `/sales/payments/${id}` },
  bill: { label: "Bill", href: (id) => `/purchases/${id}` },
};

/** The latest invoices, bills, quotes and payments with a contact. */
export function RecentActivity({ contactId, limit = 8, title = "Recent activity" }: { contactId: string; limit?: number; title?: string }) {
  const [state, setState] = useState<{ id: string; items: Activity[] } | null>(null);
  const items = state && state.id === contactId ? state.items : null;

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    fetch(`/api/v1/contacts/${contactId}/activity?limit=${limit}`, { headers: { "x-organization-id": orgId } })
      .then((r) => (r.ok ? r.json() : { activity: [] }))
      .then((json: { activity?: Activity[] }) => {
        if (!cancelled) setState({ id: contactId, items: json.activity ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ id: contactId, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [contactId, limit]);

  return (
    <div className="mt-6">
      <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">{title}</p>
      {!items ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">No invoices, bills or payments yet</p>
      ) : (
        <div className="divide-y divide-border/60 rounded-xl border border-border/80">
          {items.map((a) => (
            <Link key={`${a.type}-${a.id}`} href={ACTIVITY[a.type].href(a.id)} className="flex items-center gap-3 px-3 py-2.5 text-[13px] transition-colors hover:bg-foreground/[0.025]">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {ACTIVITY[a.type].label} <span className="font-mono text-[12.5px] text-muted-foreground">{a.number}</span>
                </span>
                <span className="block text-[12px] capitalize text-muted-foreground">
                  {formatDay(a.date)} · {a.status.replace(/_/g, " ")}
                </span>
              </span>
              <span className="tabular-nums">{formatMoney(a.amount, a.currencyCode || "USD")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

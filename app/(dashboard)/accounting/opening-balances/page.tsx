"use client";

import { useState, useEffect } from "react";
import { Scale, Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";

interface OpeningBalanceLine {
  id: string;
  description: string | null;
  debitAmount: number;
  creditAmount: number;
  account: { code: string; name: string } | null;
}

interface OpeningBalanceEntry {
  id: string;
  date: string;
  description: string;
  lines: OpeningBalanceLine[];
}

export default function OpeningBalancesPage() {
  const { open: openDrawer } = useCreateDrawer();
  const [entry, setEntry] = useState<OpeningBalanceEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/opening-balances`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.entry) setEntry(data.entry);
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;

  const totalDebit = entry?.lines.reduce((sum, l) => sum + l.debitAmount, 0) ?? 0;
  const totalCredit = entry?.lines.reduce((sum, l) => sum + l.creditAmount, 0) ?? 0;
  // Opening balances always use the org's home currency.
  const currencyCode = "USD";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opening balances"
        description="Your account starting balances from when you began using the app."
      >
        <Button size="sm" onClick={() => openDrawer("openingBalance")}>
          <Plus className="mr-2 size-4" />
          {entry ? "Replace opening balances" : "Set opening balances"}
        </Button>
      </PageHeader>

      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <Scale className="size-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">
            Opening balances are how much was in each account on the day you started
            using the app — for example money in the bank, unpaid customer invoices,
            or amounts you still owed. Set them once so your reports start from the
            right numbers.
          </p>
        </div>
      </div>

      {!entry ? (
        <div className="rounded-lg border p-10 text-center">
          <Scale className="size-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No opening balances yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your account starting balances so your books begin from the right place.
          </p>
          <Button className="mt-4" size="sm" onClick={() => openDrawer("openingBalance")}>
            <Plus className="mr-2 size-4" />
            Set opening balances
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-xs sm:text-sm text-muted-foreground">
              Starting from: {entry.date}
            </span>
          </div>

          <div className="rounded-lg border overflow-x-auto">
            <div className="grid min-w-[500px] grid-cols-[1fr_140px_140px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>Account</span>
              <span className="text-right">Money in (debit)</span>
              <span className="text-right">Money owed (credit)</span>
            </div>
            {entry.lines.map((line) => (
              <div key={line.id} className="grid min-w-[500px] grid-cols-[1fr_140px_140px] gap-2 border-b px-4 py-2 last:border-b-0">
                <p className="text-sm">
                  {line.account ? `${line.account.code} · ${line.account.name}` : "Unknown account"}
                </p>
                <span className="text-right text-sm font-mono">
                  {line.debitAmount > 0 ? formatMoney(line.debitAmount, currencyCode) : "—"}
                </span>
                <span className="text-right text-sm font-mono">
                  {line.creditAmount > 0 ? formatMoney(line.creditAmount, currencyCode) : "—"}
                </span>
              </div>
            ))}
            <div className="grid min-w-[500px] grid-cols-[1fr_140px_140px] gap-2 border-t bg-muted/30 px-4 py-2">
              <span className="text-sm font-bold">Total</span>
              <span className="text-right text-sm font-mono font-bold">{formatMoney(totalDebit, currencyCode)}</span>
              <span className="text-right text-sm font-mono font-bold">{formatMoney(totalCredit, currencyCode)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

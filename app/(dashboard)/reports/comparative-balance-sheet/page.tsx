"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { ExportButton } from "@/components/dashboard/export-button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AccountBalance {
  code: string;
  name: string;
  balance: number;
}

interface BalanceSection {
  type: string;
  accounts: AccountBalance[];
  total: number;
}

interface PeriodBalance {
  label: string;
  asOf: string;
  assets: BalanceSection;
  liabilities: BalanceSection;
  equity: BalanceSection;
}

export default function ComparativeBalanceSheetPage() {
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<PeriodBalance[]>([]);
  const [compareMonths, setCompareMonths] = useState(3);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    // Fetch balance sheet for each period end
    const now = new Date();
    const fetches: Promise<PeriodBalance | null>[] = [];

    for (let i = 0; i < compareMonths; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 0);
      if (i === 0) d.setTime(now.getTime()); // Current = today
      const asOf = d.toISOString().slice(0, 10);
      const label = i === 0 ? "Current" : d.toLocaleString("en-US", { month: "short", year: "numeric" });

      fetches.push(
        fetch(`/api/v1/reports/balance-sheet?asOf=${asOf}`, {
          headers: { "x-organization-id": orgId },
        })
          .then((r) => r.json())
          .then((data) => ({
            label,
            asOf,
            assets: data.assets || { type: "asset", accounts: [], total: 0 },
            liabilities: data.liabilities || { type: "liability", accounts: [], total: 0 },
            equity: data.equity || { type: "equity", accounts: [], total: 0 },
          }))
          .catch(() => null)
      );
    }

    Promise.all(fetches).then((results) => {
      if (cancelled) return;
      setPeriods(results.filter((r): r is PeriodBalance => r !== null).reverse());
    }).finally(() => {
      if (!cancelled) {
        setLoading(false);
        setInitialLoad(false);
      }
    });

    return () => { cancelled = true; };
  }, [compareMonths]);

  // Collect all unique account names across periods
  const allAccounts = new Map<string, { code: string; name: string; section: string }>();
  for (const p of periods) {
    for (const a of p.assets.accounts) allAccounts.set(a.code, { ...a, section: "Assets" });
    for (const a of p.liabilities.accounts) allAccounts.set(a.code, { ...a, section: "Liabilities" });
    for (const a of p.equity.accounts) allAccounts.set(a.code, { ...a, section: "Equity" });
  }

  const sections = ["Assets", "Liabilities", "Equity"] as const;

  const exportData = Array.from(allAccounts.entries()).map(([code, info]) => {
    const row: Record<string, unknown> = { section: info.section, code, name: info.name };
    for (const p of periods) {
      const sectionData = info.section === "Assets" ? p.assets : info.section === "Liabilities" ? p.liabilities : p.equity;
      const acct = sectionData.accounts.find((a) => a.code === code);
      row[p.label] = acct?.balance ?? 0;
    }
    return row;
  });

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader title="Comparative Balance Sheet" description="Period-over-period balance sheet comparison.">
        <ExportButton data={exportData} columns={["section", "code", "name", ...periods.map((p) => p.label)]} filename="comparative-balance-sheet" />
      </PageHeader>

      <div className="flex items-center gap-3">
        <Select value={String(compareMonths)} onValueChange={(v) => setCompareMonths(Number(v))}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">2 periods</SelectItem>
            <SelectItem value="3">3 periods</SelectItem>
            <SelectItem value="4">4 periods</SelectItem>
            <SelectItem value="6">6 periods</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : periods.length === 0 ? (
        <ContentReveal>
          <div className="rounded-xl border border-dashed py-12 text-center">
            <p className="text-sm text-muted-foreground">No balance sheet data available.</p>
          </div>
        </ContentReveal>
      ) : (
        <ContentReveal>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground sticky left-0 bg-muted/30 min-w-[200px]">Account</th>
                  {periods.map((p) => (
                    <th key={p.label} className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground min-w-[120px]">
                      {p.label}
                    </th>
                  ))}
                  {periods.length >= 2 && (
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground min-w-[100px]">Change</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => {
                  const sectionAccounts = Array.from(allAccounts.entries())
                    .filter(([, info]) => info.section === section)
                    .sort(([a], [b]) => a.localeCompare(b));

                  return (
                    <React.Fragment key={section}>
                      <tr className="bg-muted/20">
                        <td className="px-4 py-2 font-semibold text-xs uppercase tracking-wide sticky left-0 bg-muted/20" colSpan={periods.length + 2}>
                          {section}
                        </td>
                      </tr>
                      {sectionAccounts.map(([code, info]) => {
                        const values = periods.map((p) => {
                          const sData = section === "Assets" ? p.assets : section === "Liabilities" ? p.liabilities : p.equity;
                          return sData.accounts.find((a) => a.code === code)?.balance ?? 0;
                        });
                        const change = periods.length >= 2 ? values[values.length - 1] - values[0] : 0;

                        return (
                          <tr key={code} className="border-b last:border-b-0">
                            <td className="px-4 py-2 sticky left-0 bg-background">
                              <span className="text-muted-foreground font-mono text-xs mr-2">{code}</span>
                              {info.name}
                            </td>
                            {values.map((v, i) => (
                              <td key={i} className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(v)}</td>
                            ))}
                            {periods.length >= 2 && (
                              <td className={cn("px-4 py-2 text-right font-mono tabular-nums text-xs", change > 0 ? "text-emerald-600" : change < 0 ? "text-red-600" : "text-muted-foreground")}>
                                {change !== 0 ? `${change > 0 ? "+" : ""}${formatMoney(change)}` : "-"}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {/* Section total */}
                      <tr className="border-b bg-muted/10">
                        <td className="px-4 py-2 font-semibold sticky left-0 bg-muted/10">Total {section}</td>
                        {periods.map((p) => {
                          const total = section === "Assets" ? p.assets.total : section === "Liabilities" ? p.liabilities.total : p.equity.total;
                          return (
                            <td key={p.label} className="px-4 py-2 text-right font-mono tabular-nums font-semibold">{formatMoney(Math.round(parseFloat(String(total)) * 100))}</td>
                          );
                        })}
                        {periods.length >= 2 && <td />}
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}

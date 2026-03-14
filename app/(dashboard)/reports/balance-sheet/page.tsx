"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Section {
  type: string;
  accounts: { code: string; name: string; balance: string }[];
  total: string;
}

export default function BalanceSheetPage() {
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ assets: Section; liabilities: Section; equity: Section } | null>(null);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    fetch("/api/v1/reports/balance-sheet", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.assets) setData(d);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (initialLoad) return <BrandLoader />;

  const sections = data
    ? [
        { label: "Assets", data: data.assets },
        { label: "Liabilities", data: data.liabilities },
        { label: "Equity", data: data.equity },
      ]
    : [];

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="Balance Sheet"
        description="Assets = Liabilities + Equity"
      />

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <ContentReveal>
          <div className="space-y-6">
            {sections.map((section) => (
              <div key={section.label} className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </h3>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-24">Code</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead className="w-32 text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {section.data.accounts.map((a) => (
                        <TableRow key={a.code}>
                          <TableCell className="font-mono text-sm">{a.code}</TableCell>
                          <TableCell>{a.name}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {parseFloat(a.balance).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-bold">
                        <TableCell colSpan={2}>Total {section.label}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {parseFloat(section.data.total).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}

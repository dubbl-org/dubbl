"use client";

import { useState, useEffect } from "react";
import { Percent, Coins, Calendar, Globe, FileSpreadsheet } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

interface FilingReturn {
  kind: string;
  title: string;
  authority: string;
}

/** Filing tabs come from the jurisdiction module, not from a country list. */
function filingTabs(returns: FilingReturn[]) {
  return returns.map((r, index) => ({
    href: `/tax/returns/${r.kind}`,
    label: r.title,
    icon: index === 0 ? Globe : FileSpreadsheet,
  }));
}

export default function TaxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [returns, setReturns] = useState<FilingReturn[]>([]);
  const [openPeriods, setOpenPeriods] = useState(0);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    fetch("/api/v1/tax/returns", { headers })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.returns)) setReturns(data.returns);
      })
      .catch(() => {});

    fetch("/api/v1/tax-periods", { headers })
      .then((r) => r.json())
      .then((data) => {
        if (data.taxPeriods) {
          const open = data.taxPeriods.filter((p: { status: string }) => p.status === "open").length;
          setOpenPeriods(open);
        }
      })
      .catch(() => {});
  }, []);

  const baseTabs = [
    { href: "/tax", label: "Tax Rates", icon: Percent, exact: true },
    { href: "/tax/currencies", label: "Currencies", icon: Coins },
    { href: "/tax/periods", label: "Tax Periods", icon: Calendar, badge: openPeriods > 0 ? openPeriods : undefined },
  ];

  const tabs = [...baseTabs, ...filingTabs(returns)];

  return <TabLayout tabs={tabs}>{children}</TabLayout>;
}

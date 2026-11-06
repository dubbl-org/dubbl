"use client";

import { Percent, Coins, Calendar, Globe, FileSpreadsheet, MapPin, Calculator } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";
import { useApi } from "@/lib/query/use-api";

const EU_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

function getFilingTabs(countryCode: string | null) {
  if (!countryCode) return [];

  const tabs: { href: string; label: string; icon: typeof Percent }[] = [];

  if (countryCode === "GB" || EU_COUNTRIES.includes(countryCode)) {
    tabs.push({ href: "/tax/vat-return", label: "VAT Return", icon: Globe });
  }

  if (countryCode === "AU") {
    tabs.push({ href: "/tax/bas", label: "BAS", icon: FileSpreadsheet });
  }

  if (countryCode === "US") {
    tabs.push(
      { href: "/tax/sales-tax", label: "Sales Tax", icon: MapPin },
      { href: "/tax/schedule-c", label: "Schedule C", icon: Calculator },
    );
  }

  return tabs;
}

export default function TaxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: orgData } = useApi<{ organization?: { countryCode?: string | null }; countryCode?: string | null }>("/api/v1/organization");
  const countryCode = orgData?.organization?.countryCode || orgData?.countryCode || null;

  const { data: periodsData } = useApi<{ taxPeriods?: { status: string }[] }>("/api/v1/tax-periods");
  const openPeriods = periodsData?.taxPeriods ? periodsData.taxPeriods.filter((p) => p.status === "open").length : 0;

  const baseTabs = [
    { href: "/tax", label: "Tax Rates", icon: Percent, exact: true },
    { href: "/tax/currencies", label: "Currencies", icon: Coins },
    { href: "/tax/periods", label: "Tax Periods", icon: Calendar, badge: openPeriods > 0 ? openPeriods : undefined },
  ];

  const tabs = [...baseTabs, ...getFilingTabs(countryCode)];

  return <TabLayout tabs={tabs}>{children}</TabLayout>;
}

"use client";

import { useState, useEffect } from "react";
import { Percent, Coins, Calendar, Globe, FileSpreadsheet, MapPin, Calculator } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

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
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [openPeriods, setOpenPeriods] = useState(0);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    fetch("/api/v1/organization", { headers })
      .then((r) => r.json())
      .then((data) => {
        const code = data.organization?.countryCode || data.countryCode;
        if (code) setCountryCode(code);
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

  const tabs = [...baseTabs, ...getFilingTabs(countryCode)];

  return <TabLayout tabs={tabs}>{children}</TabLayout>;
}

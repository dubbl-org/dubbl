"use client";

import { useState, useEffect } from "react";
import { DollarSign } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
}

const columns: Column<Currency>[] = [
  {
    key: "code",
    header: "Code",
    className: "w-24",
    render: (r) => <span className="font-mono text-sm font-semibold">{r.code}</span>,
  },
  {
    key: "symbol",
    header: "Symbol",
    className: "w-20",
    render: (r) => <span className="text-sm">{r.symbol}</span>,
  },
  {
    key: "name",
    header: "Name",
    render: (r) => <span className="text-sm">{r.name}</span>,
  },
  {
    key: "decimals",
    header: "Decimals",
    className: "w-24",
    render: (r) => <span className="text-sm text-muted-foreground">{r.decimalPlaces}</span>,
  },
];

export default function CurrenciesPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/currencies")
      .then((r) => r.json())
      .then((data) => {
        if (data.currencies) setCurrencies(data.currencies);
      })
      .finally(() => setLoading(false));
  }, []);

  if (!loading && currencies.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Currencies" description="Available currencies." />
        <EmptyState
          icon={DollarSign}
          title="No currencies"
          description="Run the seed script to populate ISO 4217 currencies."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Currencies"
        description="Available currencies in the system."
      />
      <DataTable columns={columns} data={currencies} loading={loading} />
    </div>
  );
}

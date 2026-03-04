"use client";

import { useState, useEffect } from "react";
import { DollarSign } from "lucide-react";
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

  return (
    <div className="space-y-10">
      <section className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
        <div className="shrink-0">
          <p className="text-sm font-medium">Currencies</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            ISO 4217 currencies available for transactions, invoices, and reporting.
          </p>
        </div>
        <div className="min-w-0 space-y-4">
          {currencies.length > 0 && (
            <p className="text-[12px] text-muted-foreground">
              {currencies.length} currenc{currencies.length !== 1 ? "ies" : "y"} available
            </p>
          )}
          {!loading && currencies.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="No currencies"
              description="Run the seed script to populate ISO 4217 currencies."
            />
          ) : (
            <DataTable columns={columns} data={currencies} loading={loading} />
          )}
        </div>
      </section>
    </div>
  );
}

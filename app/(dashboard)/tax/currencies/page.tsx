"use client";

import { useState, useEffect, useMemo } from "react";
import { DollarSign, Search, Coins } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
}

export default function CurrenciesPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/currencies")
      .then((r) => r.json())
      .then((data) => {
        if (data.currencies) setCurrencies(data.currencies);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return currencies;
    const q = search.toLowerCase();
    return currencies.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.symbol.includes(q)
    );
  }, [currencies, search]);

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <Coins className="size-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold tracking-tight">Currencies</h2>
          {!loading && currencies.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {currencies.length}
            </span>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground">
          ISO 4217 currencies available for transactions, invoices, and reporting.
        </p>
      </div>

      {/* Search */}
      {!loading && currencies.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : currencies.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title="No currencies found"
          description="Run the seed script to populate ISO 4217 currencies."
        />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="mb-3 size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            No currencies match &quot;{search}&quot;
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground/70">
            Try a different code or name
          </p>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="group relative rounded-xl border bg-card p-4 transition-colors hover:bg-accent/50"
              >
                <div className="flex items-start justify-between">
                  <span className="font-mono text-base font-bold tracking-wide">
                    {c.code}
                  </span>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {c.symbol}
                  </span>
                </div>
                <p className="mt-2 truncate text-[13px] text-muted-foreground">
                  {c.name}
                </p>
                <p className="mt-1.5 text-[11px] text-muted-foreground/60">
                  {c.decimalPlaces} decimal{c.decimalPlaces !== 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>

          {search && (
            <p className="mt-4 text-[12px] text-muted-foreground">
              Showing {filtered.length} of {currencies.length} currenc{currencies.length !== 1 ? "ies" : "y"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

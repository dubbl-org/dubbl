"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Search,
  Coins,
  ArrowRightLeft,
  ChevronDown,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { CurrencySelect } from "@/components/ui/currency-select";

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
}

interface ExchangeRate {
  id: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  date: string;
  source: "manual" | "api";
}

function formatRate(rate: number): string {
  return (rate / 1_000_000).toFixed(6);
}

function AddCurrencySheet({
  open,
  setOpen,
  onCreated,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimalPlaces, setDecimalPlaces] = useState("2");
  const [saving, setSaving] = useState(false);

  async function handleCreate(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault?.();
    if (!code || !name || !symbol) return;
    setSaving(true);
    try {
      const res = await fetch("/api/currencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          symbol,
          decimalPlaces: parseInt(decimalPlaces),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      toast.success("Currency added");
      setOpen(false);
      setCode("");
      setName("");
      setSymbol("");
      setDecimalPlaces("2");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add currency");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add Currency</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleCreate} className="space-y-4 px-4">
          <div className="space-y-2">
            <Label>Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. JPY"
              maxLength={3}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Japanese Yen"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Symbol</Label>
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. ¥"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Decimal Places</Label>
            <Input
              type="number"
              min="0"
              max="4"
              value={decimalPlaces}
              onChange={(e) => setDecimalPlaces(e.target.value)}
              required
            />
          </div>
        </form>
        <SheetFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? "Adding..." : "Add Currency"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function AddRateSheet({
  open,
  setOpen,
  onCreated,
  orgId,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onCreated: () => void;
  orgId: string | null;
}) {
  const [baseCurrency, setBaseCurrency] = useState("");
  const [targetCurrency, setTargetCurrency] = useState("");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function handleCreate(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault?.();
    if (!orgId || !baseCurrency || !targetCurrency || !rate || !date) return;
    setSaving(true);
    try {
      const rateInt = Math.round(parseFloat(rate) * 1_000_000);
      if (!rateInt || isNaN(rateInt)) {
        toast.error("Please enter a valid rate");
        return;
      }
      const res = await fetch("/api/v1/exchange-rates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          rates: [
            {
              baseCurrency,
              targetCurrency,
              rate: rateInt,
              date,
              source: "manual",
            },
          ],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      toast.success("Exchange rate created");
      setOpen(false);
      setBaseCurrency("");
      setTargetCurrency("");
      setRate("");
      setDate(new Date().toISOString().slice(0, 10));
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create exchange rate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New Exchange Rate</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleCreate} className="space-y-4 px-4">
          <div className="space-y-2">
            <Label>Base Currency</Label>
            <CurrencySelect value={baseCurrency} onValueChange={setBaseCurrency} />
          </div>
          <div className="space-y-2">
            <Label>Target Currency</Label>
            <CurrencySelect value={targetCurrency} onValueChange={setTargetCurrency} />
          </div>
          <div className="space-y-2">
            <Label>Rate</Label>
            <Input
              type="number"
              step="0.000001"
              min="0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="1.234567"
              required
            />
            <p className="text-[11px] text-muted-foreground">
              How much 1 unit of base currency is worth in target currency
            </p>
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
        </form>
        <SheetFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? "Creating..." : "Create"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function CurrenciesPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [baseCurrency, setBaseCurrency] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [currencySheetOpen, setCurrencySheetOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  async function fetchOrganization() {
    try {
      const res = await fetch("/api/v1/organization", {
        headers: orgId ? { "x-organization-id": orgId } : {},
      });
      const data = await res.json();
      if (data.organization?.defaultCurrency) {
        setBaseCurrency(data.organization.defaultCurrency);
      }
    } catch {
      /* ignore */
    }
  }

  async function fetchExchangeRates() {
    if (!orgId) {
      setRatesLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/v1/exchange-rates", {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.data) setExchangeRates(data.data);
    } catch {
      /* ignore */
    } finally {
      setRatesLoading(false);
    }
  }

  async function fetchCurrencies() {
    try {
      const res = await fetch("/api/currencies");
      const data = await res.json();
      if (data.currencies) setCurrencies(data.currencies);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchOrganization();
    fetchExchangeRates();
    fetchCurrencies();
  }, [orgId]);

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

  const isLoading = loading || ratesLoading;

  if (isLoading) {
    return (
      <div className="w-full space-y-6">
        <PageHeader
          title="Currencies & Exchange Rates"
          description="Manage exchange rates and browse ISO 4217 currencies for transactions, invoices, and reporting."
        />
        <BrandLoader className="h-48" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Currencies & Exchange Rates"
        description="Manage exchange rates and browse ISO 4217 currencies for transactions, invoices, and reporting."
      >
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCurrencySheetOpen(true)}
        >
          <Plus className="mr-1.5 size-3.5" />
          Add Currency
        </Button>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={() => setSheetOpen(true)}
        >
          <Plus className="mr-1.5 size-3.5" />
          Add Rate
        </Button>
      </PageHeader>

      {/* Base Currency Card */}
      {baseCurrency && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/20 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700/70 dark:text-emerald-400/70">
            Organization Base Currency
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {baseCurrency}
          </p>
          <p className="mt-1 text-[12px] text-emerald-600/60 dark:text-emerald-400/50">
            All exchange rates are relative to this base currency
          </p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/40 dark:bg-blue-950/20 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-blue-700/70 dark:text-blue-400/70">
            Exchange Rates
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-blue-700 dark:text-blue-300">
            {exchangeRates.length}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/20 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700/70 dark:text-emerald-400/70">
            Currency Pairs
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {new Set(
              exchangeRates.map((r) => `${r.baseCurrency}/${r.targetCurrency}`)
            ).size}
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700/70 dark:text-amber-400/70">
            ISO Currencies
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
            {currencies.length}
          </p>
        </div>
      </div>

      {/* Exchange Rates Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="size-4 text-muted-foreground" />
          <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Exchange Rates
          </h3>
        </div>

        {exchangeRates.length === 0 ? (
          <EmptyState
            icon={ArrowRightLeft}
            title="No exchange rates"
            description="Add your first exchange rate to get started."
          />
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {exchangeRates.map((rate) => (
              <div
                key={rate.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 font-mono text-sm font-semibold">
                    <span>{rate.baseCurrency}</span>
                    <ArrowRightLeft className="size-3 text-muted-foreground" />
                    <span>{rate.targetCurrency}</span>
                  </div>
                  <span className="font-mono text-sm tabular-nums text-muted-foreground">
                    {formatRate(rate.rate)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
                    <CalendarDays className="size-3" />
                    <span>
                      {new Date(rate.date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <Badge
                    variant={rate.source === "api" ? "default" : "secondary"}
                    className={cn(
                      "text-[10px] uppercase",
                      rate.source === "api"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    )}
                  >
                    {rate.source}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Currency Reference Section (Collapsible) */}
      <Collapsible open={refOpen} onOpenChange={setRefOpen}>
        <div className="flex items-center gap-2">
          <Coins className="size-4 text-muted-foreground" />
          <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Currency Reference
          </h3>
          {currencies.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {currencies.length}
            </span>
          )}
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto h-7 px-2">
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  refOpen && "rotate-180"
                )}
              />
              <span className="ml-1 text-xs">
                {refOpen ? "Hide" : "Show"}
              </span>
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="mt-3 space-y-3">
          {currencies.length === 0 ? (
            <EmptyState
              icon={Coins}
              title="No currencies found"
              description="Run the seed script to populate ISO 4217 currencies."
            />
          ) : (
            <>
              <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter by code or name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {filtered.length === 0 ? (
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
                          {c.decimalPlaces} decimal
                          {c.decimalPlaces !== 1 ? "s" : ""}
                        </p>
                      </div>
                    ))}
                  </div>

                  {search && (
                    <p className="mt-4 text-[12px] text-muted-foreground">
                      Showing {filtered.length} of {currencies.length} currenc
                      {currencies.length !== 1 ? "ies" : "y"}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Add Rate Sheet */}
      <AddRateSheet
        open={sheetOpen}
        setOpen={setSheetOpen}
        onCreated={() => fetchExchangeRates()}
        orgId={orgId}
      />

      {/* Add Currency Sheet */}
      <AddCurrencySheet
        open={currencySheetOpen}
        setOpen={setCurrencySheetOpen}
        onCreated={() => fetchCurrencies()}
      />
    </div>
  );
}

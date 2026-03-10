"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
}

let currencyCache: Currency[] | null = null;

async function fetchCurrencies(): Promise<Currency[]> {
  if (currencyCache) return currencyCache;
  const res = await fetch("/api/currencies");
  const data = await res.json();
  currencyCache = data.currencies ?? [];
  return currencyCache!;
}

interface CurrencySelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  /** Compact mode shows just the code, no name */
  compact?: boolean;
}

export function CurrencySelect({
  value,
  onValueChange,
  className,
  disabled,
  compact,
}: CurrencySelectProps) {
  const [currencies, setCurrencies] = useState<Currency[]>(currencyCache ?? []);

  useEffect(() => {
    fetchCurrencies().then(setCurrencies);
  }, []);

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={cn(compact && "w-[90px]", className)}>
        <SelectValue placeholder="Currency" />
      </SelectTrigger>
      <SelectContent className="max-h-[280px]">
        {currencies.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {compact ? (
              c.code
            ) : (
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground w-8">
                  {c.code}
                </span>
                <span>{c.symbol}</span>
                <span className="truncate">{c.name}</span>
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

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
  const [open, setOpen] = useState(false);
  const [currencies, setCurrencies] = useState<Currency[]>(currencyCache ?? []);

  useEffect(() => {
    fetchCurrencies().then(setCurrencies);
  }, []);

  const selected = currencies.find((c) => c.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "justify-between font-normal",
            compact ? "w-[110px]" : "w-full",
            !value && "text-muted-foreground",
            className
          )}
        >
          {value ? (
            compact ? (
              <span className="font-mono text-xs">{value}</span>
            ) : (
              <span className="flex items-center gap-2 truncate">
                <span className="font-mono text-xs text-muted-foreground">
                  {value}
                </span>
                {selected && selected.symbol !== selected.code && (
                  <span className="text-muted-foreground">{selected.symbol}</span>
                )}
                <span className="truncate">{selected?.name}</span>
              </span>
            )
          ) : (
            "Currency"
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search currency..." />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup>
              {currencies.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.code} ${c.name}`}
                  onSelect={() => {
                    onValueChange(c.code);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === c.code ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-9 shrink-0 font-mono text-xs text-muted-foreground">
                      {c.code}
                    </span>
                    <span className="w-8 shrink-0 text-center text-muted-foreground">
                      {c.symbol && c.symbol !== c.code ? c.symbol : ""}
                    </span>
                    <span className="truncate">{c.name}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

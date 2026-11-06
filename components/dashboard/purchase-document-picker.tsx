"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { formatMoney } from "@/lib/money";
import { useApi } from "@/lib/query/use-api";

interface PurchaseDocument {
  id: string;
  poNumber?: string;
  billNumber?: string;
  issueDate?: string;
  total: number;
  currencyCode: string;
  contact?: { name: string } | null;
}

const KINDS = {
  purchase_order: { url: "/api/v1/purchase-orders", number: (d: PurchaseDocument) => d.poNumber ?? "", noun: "purchase orders" },
  bill: { url: "/api/v1/bills", number: (d: PurchaseDocument) => d.billNumber ?? "", noun: "bills" },
} as const;

/**
 * Pick a purchase order or a bill (the 100 most recent, searchable by number
 * or supplier). Picking the selected one again clears it.
 */
export function PurchaseDocumentPicker({
  kind,
  value,
  onChange,
  placeholder,
}: {
  kind: keyof typeof KINDS;
  value: string;
  onChange: (id: string, doc?: PurchaseDocument) => void;
  placeholder?: string;
}) {
  const cfg = KINDS[kind];
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");
  const { data, loading } = useApi<{ data?: PurchaseDocument[] }>(opened || value ? `${cfg.url}?limit=100` : null);
  const docs = data?.data ?? [];
  const selected = docs.find((d) => d.id === value);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? docs.filter((d) => cfg.number(d).toLowerCase().includes(q) || (d.contact?.name ?? "").toLowerCase().includes(q))
    : docs;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setOpened(true);
        else setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="h-9 w-full justify-between font-normal">
          {selected ? (
            <span className="truncate">
              {cfg.number(selected)} <span className="text-muted-foreground">{selected.contact?.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder ?? "None"}</span>
          )}
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by number or supplier..." value={search} onValueChange={setSearch} />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <CommandEmpty>
                <div className="flex flex-col items-center gap-1.5 py-2">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">No {cfg.noun} found</span>
                </div>
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {filtered.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={d.id}
                    onSelect={() => {
                      onChange(d.id === value ? "" : d.id, d.id === value ? undefined : d);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check className={cn("size-4 shrink-0", value === d.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{cfg.number(d)}</span>
                      <span className="truncate text-xs text-muted-foreground">{d.contact?.name ?? "No supplier"}</span>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatMoney(d.total, d.currencyCode)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

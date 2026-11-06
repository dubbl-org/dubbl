"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Loader2, Package } from "lucide-react";
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
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useApi } from "@/lib/query/use-api";

export interface InventoryItemOption {
  id: string;
  name: string;
  code: string;
  sku: string | null;
  quantityOnHand: number;
  /** Cents per unit. */
  purchasePrice: number;
  /** Cents per unit. */
  salePrice: number;
  /** Default sales account for invoice lines. */
  revenueAccountId?: string | null;
}

interface InventoryItemPickerProps {
  value: string;
  /** Called with "" when the selected item is picked again (cleared). */
  onChange: (itemId: string, item?: InventoryItemOption) => void;
  placeholder?: string;
  /** Smaller trigger, for use inside line editors. */
  compact?: boolean;
}

export function InventoryItemPicker({ value, onChange, placeholder = "Select item...", compact }: InventoryItemPickerProps) {
  const [open, setOpen] = useState(false);
  // Items load once the popover has been opened
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const isSearching = search !== debouncedSearch;

  // Fetch items for the debounced search (after the first open). No keepPrevious: an
  // uncached search shows the spinner, as before, instead of the previous term's results.
  const params = new URLSearchParams({ limit: "50" });
  if (debouncedSearch) params.set("search", debouncedSearch);
  const { data, loading: fetching } = useApi<{ data?: InventoryItemOption[] }>(opened ? `/api/v1/inventory?${params}` : null, { learn: false });
  const items = data?.data ?? [];
  const loading = fetching || isSearching;

  // The item last picked from the list, so its label stays while a new search loads
  const [picked, setPicked] = useState<InventoryItemOption | null>(null);

  // Resolve the selected item label if we have a value but no match in the list
  const inItems = !!value && items.some((i) => i.id === value);
  const { data: resolved } = useApi<{ inventoryItem?: InventoryItemOption }>(value && !inItems && picked?.id !== value ? `/api/v1/inventory/${value}` : null);

  // Derive selected from items list or fall back to the picked item / fetched resolution
  const selectedItem = !value ? null : items.find((i) => i.id === value) || (picked?.id === value ? picked : null) || resolved?.inventoryItem || null;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setOpened(true);
    } else {
      setSearch("");
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", compact ? "h-8 text-sm" : "h-9")}
        >
          {selectedItem ? (
            <span className="truncate">
              {selectedItem.name} <span className="text-muted-foreground">({selectedItem.code})</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search items..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <CommandEmpty>
                <div className="flex flex-col items-center gap-1.5 py-2">
                  <Package className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {search ? "No items match your search" : "No items found"}
                  </span>
                </div>
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => {
                      setPicked(item);
                      if (item.id === value) onChange("");
                      else onChange(item.id, item);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check className={cn("size-4 shrink-0", value === item.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate text-sm">{item.name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {item.code}{item.sku ? ` · ${item.sku}` : ""} · Qty: {item.quantityOnHand}
                      </span>
                    </div>
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

"use client";

import { useState, useEffect, useCallback } from "react";
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

interface InventoryItemOption {
  id: string;
  name: string;
  code: string;
  sku: string | null;
  quantityOnHand: number;
}

interface InventoryItemPickerProps {
  value: string;
  onChange: (itemId: string) => void;
  placeholder?: string;
}

export function InventoryItemPicker({ value, onChange, placeholder = "Select item..." }: InventoryItemPickerProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InventoryItemOption[]>([]);
  const [selected, setSelected] = useState<InventoryItemOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  // Fetch items when popover opens or search changes
  const fetchItems = useCallback((query: string) => {
    if (!orgId) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (query) params.set("search", query);
    fetch(`/api/v1/inventory?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setItems(data.data);
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  // Load on open + when debounced search changes
  useEffect(() => {
    if (!open) return;
    fetchItems(debouncedSearch);
  }, [open, debouncedSearch, fetchItems]);

  // Resolve the selected item label if we have a value but no match yet
  useEffect(() => {
    if (!value || !orgId) { setSelected(null); return; }
    const match = items.find((i) => i.id === value);
    if (match) { setSelected(match); return; }
    // Fetch single item to display its name
    fetch(`/api/v1/inventory/${value}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.inventoryItem) setSelected(data.inventoryItem);
      })
      .catch(() => {});
  }, [value, items, orgId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9"
        >
          {selected ? (
            <span className="truncate">
              {selected.name} <span className="text-muted-foreground">({selected.code})</span>
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
                      onChange(item.id === value ? "" : item.id);
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

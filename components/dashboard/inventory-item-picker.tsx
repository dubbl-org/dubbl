"use client";

import { useState, useEffect, useRef } from "react";
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
  const fetchIdRef = useRef(0);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  // Fetch items when debounced search changes (while open)
  useEffect(() => {
    if (!open || !orgId) return;
    const id = ++fetchIdRef.current;
    const params = new URLSearchParams({ limit: "50" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    // Only show loading for search changes, not the initial open (handled by onOpenChange)
    fetch(`/api/v1/inventory?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (id === fetchIdRef.current && data.data) {
          setItems(data.data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (id === fetchIdRef.current) setLoading(false);
      });
  }, [open, debouncedSearch, orgId]);

  // Resolve the selected item label if we have a value but no match yet
  const resolvedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!value || !orgId) return;
    if (items.find((i) => i.id === value)) return;
    if (resolvedRef.current === value) return;
    let cancelled = false;
    resolvedRef.current = value;
    fetch(`/api/v1/inventory/${value}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.inventoryItem) setSelected(data.inventoryItem);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [value, items, orgId]);

  // Derive selected from items list or keep the fetched resolution
  const selectedItem = !value ? null : items.find((i) => i.id === value) || selected;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setLoading(true);
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
          className="w-full justify-between font-normal h-9"
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
            onValueChange={(v) => { setSearch(v); setLoading(true); }}
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

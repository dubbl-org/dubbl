"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, ChevronsUpDown, Loader2, Warehouse } from "lucide-react";
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

interface WarehouseOption {
  id: string;
  name: string;
  code: string;
  address: string | null;
  isDefault: boolean | null;
}

interface WarehousePickerProps {
  value: string;
  onChange: (warehouseId: string) => void;
  placeholder?: string;
}

export function WarehousePicker({ value, onChange, placeholder = "Select warehouse..." }: WarehousePickerProps) {
  const [open, setOpen] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchWarehouses = useCallback(() => {
    if (!orgId) return;
    setLoading(true);
    fetch("/api/v1/warehouses", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setWarehouses(data.data);
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  // Load on open
  useEffect(() => {
    if (!open) return;
    fetchWarehouses();
  }, [open, fetchWarehouses]);

  const selected = warehouses.find((w) => w.id === value);

  // Client-side filter since warehouse lists are small
  const filtered = debouncedSearch
    ? warehouses.filter((w) =>
        w.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        w.code.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : warehouses;

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
            placeholder="Search warehouses..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <CommandEmpty>
                <div className="flex flex-col items-center gap-1.5 py-2">
                  <Warehouse className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {search ? "No warehouses match your search" : "No warehouses found"}
                  </span>
                </div>
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {filtered.map((wh) => (
                  <CommandItem
                    key={wh.id}
                    value={wh.id}
                    onSelect={() => {
                      onChange(wh.id === value ? "" : wh.id);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check className={cn("size-4 shrink-0", value === wh.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm">{wh.name}</span>
                        {wh.isDefault && (
                          <span className="text-[10px] text-muted-foreground">(default)</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground truncate">{wh.code}</span>
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

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Check, ChevronsUpDown, Plus, Loader2, Tag, Trash2 } from "lucide-react";
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
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  parentId: string | null;
}

interface CategoryPickerProps {
  value: string;
  onChange: (categoryId: string) => void;
  placeholder?: string;
}

export function CategoryPicker({ value, onChange, placeholder = "Select category..." }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const fetchIdRef = useRef(0);
  const [fetchCount, setFetchCount] = useState(0);
  const loading = fetchCount > 0;
  const { open: openDrawer } = useCreateDrawer();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchCategories = useCallback(() => {
    if (!orgId) return;
    const id = ++fetchIdRef.current;
    setFetchCount((c) => c + 1);
    fetch("/api/v1/inventory/categories", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (id === fetchIdRef.current && data.flat) setCategories(data.flat);
      })
      .catch(() => {})
      .finally(() => setFetchCount((c) => c - 1));
  }, [orgId]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      fetchCategories();
    } else {
      setSearch("");
    }
  }

  // Listen for refetch-categories event (dispatched by CategoryDrawer on create)
  useEffect(() => {
    window.addEventListener("refetch-categories", fetchCategories);
    return () => window.removeEventListener("refetch-categories", fetchCategories);
  }, [fetchCategories]);

  const parentMap = new Map(categories.map((c) => [c.id, c]));
  const selected = categories.find((c) => c.id === value);

  // Client-side filter since category lists are small
  const filtered = debouncedSearch
    ? categories.filter((c) => {
        const parent = c.parentId ? parentMap.get(c.parentId) : null;
        const haystack = `${c.name} ${parent?.name || ""}`.toLowerCase();
        return haystack.includes(debouncedSearch.toLowerCase());
      })
    : categories;

  async function handleDelete(e: React.MouseEvent, cat: Category) {
    e.stopPropagation();
    e.preventDefault();

    const confirmed = await confirm({
      title: `Delete "${cat.name}"?`,
      description: "This category will be removed. Items using it will be unlinked.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    if (!orgId) return;

    try {
      const res = await fetch(`/api/v1/inventory/categories/${cat.id}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete category");
      }
      toast.success("Category deleted");
      if (value === cat.id) onChange("");
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete category");
    }
  }

  return (
    <>
      {confirmDialog}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-9 bg-transparent dark:bg-transparent"
          >
            {selected ? (
              <span className="flex items-center gap-2 truncate">
                {selected.color && (
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: selected.color }}
                  />
                )}
                <span className="truncate">{selected.name}</span>
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
              placeholder="Search categories..."
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
                    <Tag className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {search ? "No categories match your search" : "No categories found"}
                    </span>
                  </div>
                </CommandEmpty>
              ) : (
                <CommandGroup>
                  {filtered.map((cat) => {
                    const parent = cat.parentId ? parentMap.get(cat.parentId) : null;
                    return (
                      <CommandItem
                        key={cat.id}
                        value={cat.id}
                        onSelect={() => {
                          onChange(cat.id === value ? "" : cat.id);
                          setOpen(false);
                          setSearch("");
                        }}
                        className="group"
                      >
                        <Check className={cn("size-4 shrink-0", value === cat.id ? "opacity-100" : "opacity-0")} />
                        {cat.color && (
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                        )}
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate text-sm">{cat.name}</span>
                          {parent && (
                            <span className="text-xs text-muted-foreground truncate">{parent.name}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 transition-opacity shrink-0"
                          onClick={(e) => handleDelete(e, cat)}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </button>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
            <div className="h-px bg-border" />
            <div className="p-1">
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => {
                  setOpen(false);
                  openDrawer("category");
                }}
              >
                <Plus className="size-4 text-muted-foreground" />
                Add category
              </button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}

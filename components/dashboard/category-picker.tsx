"use client";

import { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown, Plus, Loader2, Tag, Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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

const COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

interface CategoryPickerProps {
  value: string;
  onChange: (categoryId: string) => void;
  placeholder?: string;
  triggerClassName?: string;
}

export function CategoryPicker({ value, onChange, placeholder = "Select category...", triggerClassName }: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const isSearching = search !== debouncedSearch;
  const fetchIdRef = useRef(0);
  const [fetchCount, setFetchCount] = useState(0);
  const fetching = fetchCount > 0;
  const { open: openDrawer } = useCreateDrawer();
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Edit sheet state
  const [editOpen, setEditOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  function doFetch() {
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
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      doFetch();
    } else {
      setSearch("");
    }
  }

  // Listen for refetch-categories event (dispatched by CategoryDrawer on create)
  const doFetchRef = useRef(doFetch);
  doFetchRef.current = doFetch;
  useEffect(() => {
    function handler() { doFetchRef.current(); }
    window.addEventListener("refetch-categories", handler);
    return () => window.removeEventListener("refetch-categories", handler);
  }, []);

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

  const loading = fetching || isSearching;

  async function handleDelete(e: React.MouseEvent, cat: Category) {
    e.stopPropagation();
    e.preventDefault();

    const confirmed = await confirm({
      title: `Delete "${cat.name}"?`,
      description: "This category will be removed. Items using it will be unlinked.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed || !orgId) return;

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

  function handleEdit(e: React.MouseEvent, cat: Category) {
    e.stopPropagation();
    e.preventDefault();
    setOpen(false);
    setEditCategory(cat);
    setEditOpen(true);
  }

  async function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!orgId || !editCategory) return;
    setSaving(true);
    const form = new FormData(e.currentTarget);

    try {
      const res = await fetch(`/api/v1/inventory/categories/${editCategory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: form.get("name"),
          color: form.get("color") || null,
          description: form.get("description") || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update category");
      }
      const data = await res.json();
      toast.success("Category updated");
      setCategories((prev) =>
        prev.map((c) => (c.id === editCategory.id ? { ...c, ...data.category } : c))
      );
      setEditOpen(false);
      setEditCategory(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setSaving(false);
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
            className={cn("w-full justify-between font-normal h-9", triggerClassName)}
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
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            className="p-0.5 rounded hover:bg-accent"
                            onClick={(e) => handleEdit(e, cat)}
                          >
                            <Pencil className="size-3.5 text-muted-foreground" />
                          </button>
                          <button
                            type="button"
                            className="p-0.5 rounded hover:bg-destructive/10"
                            onClick={(e) => handleDelete(e, cat)}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </button>
                        </div>
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

      {/* Edit Category Sheet */}
      <Sheet open={editOpen} onOpenChange={(v) => { if (!v) { setEditOpen(false); setEditCategory(null); } }}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Tag className="size-5" />
              </div>
              <div>
                <SheetTitle className="text-lg">Edit Category</SheetTitle>
                <SheetDescription>Update category details.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="picker-cat-name">Name *</Label>
                  <Input
                    id="picker-cat-name"
                    name="name"
                    required
                    defaultValue={editCategory?.name || ""}
                    key={editCategory?.id || "new"}
                  />
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-2 flex-wrap">
                    {COLORS.map((c) => (
                      <label key={c} className="cursor-pointer">
                        <input
                          type="radio"
                          name="color"
                          value={c}
                          className="sr-only peer"
                          defaultChecked={editCategory?.color === c}
                          key={`${editCategory?.id || "new"}-${c}`}
                        />
                        <div
                          className="size-6 rounded-full ring-2 ring-transparent peer-checked:ring-offset-2 peer-checked:ring-gray-400 transition-all"
                          style={{ backgroundColor: c }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="picker-cat-desc">Description</Label>
                  <Textarea
                    id="picker-cat-desc"
                    name="description"
                    rows={2}
                    placeholder="Optional description..."
                    defaultValue={editCategory?.description || ""}
                    key={editCategory?.id || "new-d"}
                  />
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-4 py-3 sm:px-6 sm:py-4 backdrop-blur-sm">
              <Button type="button" variant="outline" onClick={() => { setEditOpen(false); setEditCategory(null); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                {saving ? "Saving..." : "Update Category"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

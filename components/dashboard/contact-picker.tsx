"use client";

import { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown, Plus, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  CommandSeparator,
} from "@/components/ui/command";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  type: string;
}

const typeBadge: Record<string, { class: string; label: string }> = {
  customer: {
    class: "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400",
    label: "Customer",
  },
  supplier: {
    class: "border-orange-200 bg-orange-50 text-orange-600 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400",
    label: "Supplier",
  },
  both: {
    class: "border-purple-200 bg-purple-50 text-purple-600 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400",
    label: "Both",
  },
};

interface ContactPickerProps {
  value: string;
  onChange: (contactId: string) => void;
  type?: "customer" | "supplier";
  placeholder?: string;
}

export function ContactPicker({ value, onChange, type, placeholder = "Select contact..." }: ContactPickerProps) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);
  const { open: openDrawer } = useCreateDrawer();

  // Fetch contacts when popover opens for the first time
  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;

    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const params = new URLSearchParams({ limit: "200" });
    if (type) params.set("type", type);

    fetch(`/api/v1/contacts?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setContacts(data.data);
      })
      .finally(() => setLoading(false));
  }, [open, type]);

  const selected = contacts.find((c) => c.id === value);

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
            <span className="flex items-center gap-2 truncate">
              <span className="truncate">{selected.name}</span>
              {typeBadge[selected.type] && (
                <Badge variant="outline" className={cn("shrink-0 text-[10px] px-1.5 py-0", typeBadge[selected.type].class)}>
                  {typeBadge[selected.type].label}
                </Badge>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start">
        <Command>
          <CommandInput placeholder="Search contacts..." />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>
                  <div className="flex flex-col items-center gap-1.5 py-2">
                    <Users className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">No contacts found</span>
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  {contacts.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${c.email || ""}`}
                      onSelect={() => {
                        onChange(c.id === value ? "" : c.id);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("size-4 shrink-0", value === c.id ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm">{c.name}</span>
                          {typeBadge[c.type] && (
                            <Badge variant="outline" className={cn("shrink-0 text-[10px] px-1.5 py-0", typeBadge[c.type].class)}>
                              {typeBadge[c.type].label}
                            </Badge>
                          )}
                        </div>
                        {c.email && (
                          <span className="text-xs text-muted-foreground truncate">{c.email}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          <CommandSeparator />
          <div className="p-1">
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={() => {
                setOpen(false);
                openDrawer("contact");
              }}
            >
              <Plus className="size-4 text-muted-foreground" />
              Create new contact
            </button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Wallet } from "lucide-react";
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
  CommandSeparator,
} from "@/components/ui/command";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subType?: string | null;
}

interface AccountPickerProps {
  value: string;
  onChange: (accountId: string) => void;
  typeFilter?: string[];
  placeholder?: string;
  /** Show a "Create new account" affordance linking to chart-of-accounts settings */
  allowCreate?: boolean;
}

// Human labels + a sensible accounting display order for the account-type groups.
const TYPE_LABELS: Record<string, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Income",
  expense: "Expenses",
};
const TYPE_ORDER = ["expense", "revenue", "asset", "liability", "equity"];

export function AccountPicker({
  value,
  onChange,
  typeFilter,
  placeholder = "Select account...",
  allowCreate = false,
}: AccountPickerProps) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  // typeFilter is often an inline array literal (new identity each render); join to a
  // stable string so the effect doesn't refetch on every parent render, and derive
  // the allow-list from that same string inside the effect (no ref needed).
  const typeKey = typeFilter ? typeFilter.join(",") : "";

  useEffect(() => {
    let cancelled = false;
    const allow = typeKey ? typeKey.split(",") : null;
    (async () => {
      try {
        const orgId = localStorage.getItem("activeOrgId");
        if (!orgId) return;
        const res = await fetch("/api/v1/accounts", { headers: { "x-organization-id": orgId } });
        const data = await res.json();
        if (!cancelled && data.accounts) {
          setAccounts(allow ? data.accounts.filter((a: Account) => allow.includes(a.type)) : data.accounts);
        }
      } catch {
        // leave accounts empty on failure
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [typeKey]);

  // Group accounts by type, in accounting display order, each group sorted by code.
  const groups = useMemo(() => {
    const byType = new Map<string, Account[]>();
    for (const a of accounts) {
      const list = byType.get(a.type) || [];
      list.push(a);
      byType.set(a.type, list);
    }
    const ordered = [
      ...TYPE_ORDER.filter((t) => byType.has(t)),
      ...Array.from(byType.keys()).filter((t) => !TYPE_ORDER.includes(t)),
    ];
    return ordered.map((type) => ({
      type,
      label: TYPE_LABELS[type] || type,
      items: (byType.get(type) || []).sort((a, b) => a.code.localeCompare(b.code)),
    }));
  }, [accounts]);

  const selected = accounts.find((a) => a.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between px-3 text-sm font-normal"
        >
          {selected ? (
            <span className="truncate">
              <span className="text-muted-foreground tabular-nums">{selected.code}</span>
              {" — "}
              {selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-auto size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name or code..." />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>
                  <div className="flex flex-col items-center gap-1.5 py-2">
                    <Wallet className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">No accounts found</span>
                  </div>
                </CommandEmpty>
                {groups.map((group) => (
                  <CommandGroup key={group.type} heading={group.label}>
                    {group.items.map((a) => (
                      <CommandItem
                        key={a.id}
                        value={`${a.code} ${a.name}`}
                        onSelect={() => {
                          onChange(a.id === value ? "" : a.id);
                          setOpen(false);
                        }}
                      >
                        <Check className={cn("size-4 shrink-0", value === a.id ? "opacity-100" : "opacity-0")} />
                        <span className="text-muted-foreground tabular-nums text-xs w-12 shrink-0">{a.code}</span>
                        <span className="truncate text-sm">{a.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </>
            )}
          </CommandList>
          {allowCreate && (
            <>
              <CommandSeparator />
              <div className="p-1">
                <a
                  href="/settings/chart-of-accounts"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Plus className="size-4 text-muted-foreground" />
                  Manage chart of accounts
                </a>
              </div>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

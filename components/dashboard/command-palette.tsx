"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Receipt,
  User,
  Paperclip,
  Loader2,
} from "lucide-react";

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

type SearchResult = {
  type: "invoice" | "bill" | "contact" | "document";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

const TYPE_META: Record<
  SearchResult["type"],
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  invoice: { label: "Invoices", icon: FileText },
  bill: { label: "Bills", icon: Receipt },
  contact: { label: "Contacts", icon: User },
  document: { label: "Documents", icon: Paperclip },
};

const GROUP_ORDER: SearchResult["type"][] = [
  "invoice",
  "bill",
  "contact",
  "document",
];

/**
 * Global Cmd/Ctrl+K command palette. Debounces the query, calls
 * /api/v1/search (org-scoped), and navigates to the selected result.
 *
 * Mount once, globally. The orchestrator is responsible for mounting it —
 * do not render it inside this file.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Toggle on Cmd/Ctrl+K.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Open when the topbar Search button dispatches "open-command-palette".
  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    document.addEventListener("open-command-palette", onOpen);
    return () => document.removeEventListener("open-command-palette", onOpen);
  }, []);

  // Debounced server search. Aborts stale requests.
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const orgId =
        typeof window !== "undefined"
          ? localStorage.getItem("activeOrgId")
          : null;
      fetch(`/api/v1/search?q=${encodeURIComponent(q)}`, {
        headers: orgId ? { "x-organization-id": orgId } : undefined,
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((data) => setResults(data.results ?? []))
        .catch((err) => {
          if (err?.name !== "AbortError") setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Reset transient state whenever the dialog closes.
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setLoading(false);
    }
  }, [open]);

  const handleSelect = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const grouped = GROUP_ORDER.map((type) => ({
    type,
    items: results.filter((r) => r.type === type),
  })).filter((g) => g.items.length > 0);

  const trimmedLen = query.trim().length;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Search invoices, bills, contacts, and documents."
      // Disable cmdk's built-in fuzzy filter — results come from the server.
      shouldFilter={false}
    >
      <CommandInput
        placeholder="Search invoices, bills, contacts, documents..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Searching...
          </div>
        )}

        {!loading && trimmedLen >= 2 && grouped.length === 0 && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}

        {!loading && trimmedLen < 2 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Type to search invoices, bills, contacts, and documents.
          </div>
        )}

        {!loading &&
          grouped.map((group) => {
            const Icon = TYPE_META[group.type].icon;
            return (
              <CommandGroup
                key={group.type}
                heading={TYPE_META[group.type].label}
              >
                {group.items.map((item) => (
                  <CommandItem
                    key={`${item.type}-${item.id}`}
                    // value must be unique so cmdk keyboard selection works
                    // even with filtering disabled.
                    value={`${item.type}-${item.id}-${item.title}`}
                    onSelect={() => handleSelect(item.href)}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{item.title}</span>
                      {item.subtitle && (
                        <span className="truncate text-xs text-muted-foreground">
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
      </CommandList>
    </CommandDialog>
  );
}

export default CommandPalette;

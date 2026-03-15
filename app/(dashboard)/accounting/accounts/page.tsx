"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Search, X } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subType: string | null;
  isActive: boolean;
  description: string | null;
  currencyCode: string;
}

const TYPE_META: Record<string, { dot: string; bg: string; text: string; border: string }> = {
  asset: { dot: "bg-blue-500", bg: "bg-blue-500/8", text: "text-blue-700 dark:text-blue-400", border: "border-blue-200 dark:border-blue-800" },
  liability: { dot: "bg-orange-500", bg: "bg-orange-500/8", text: "text-orange-700 dark:text-orange-400", border: "border-orange-200 dark:border-orange-800" },
  equity: { dot: "bg-purple-500", bg: "bg-purple-500/8", text: "text-purple-700 dark:text-purple-400", border: "border-purple-200 dark:border-purple-800" },
  revenue: { dot: "bg-emerald-500", bg: "bg-emerald-500/8", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800" },
  expense: { dot: "bg-red-500", bg: "bg-red-500/8", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800" },
};

const ALL_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;

export default function AccountsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState("code:asc");

  useDocumentTitle("Accounting \u00B7 Chart of Accounts");

  function fetchAccounts() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.accounts) setAccounts(data.accounts);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    const handler = () => fetchAccounts();
    window.addEventListener("accounts-changed", handler);
    return () => window.removeEventListener("accounts-changed", handler);
  }, []);

  const filtered = useMemo(() => {
    let result = accounts;

    if (typeFilter !== "all") {
      result = result.filter((a) => a.type === typeFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.code.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q)
      );
    }

    const [sortKey, sortDir] = sort.split(":");
    const mul = sortDir === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      if (sortKey === "code") return mul * a.code.localeCompare(b.code);
      if (sortKey === "name") return mul * a.name.localeCompare(b.name);
      if (sortKey === "type") return mul * a.type.localeCompare(b.type);
      return 0;
    });

    return result;
  }, [accounts, typeFilter, search, sort]);

  const grouped = useMemo(() => {
    const map: Record<string, Account[]> = {};
    for (const type of ALL_TYPES) map[type] = [];
    for (const a of filtered) {
      if (map[a.type]) map[a.type].push(a);
    }
    return map;
  }, [filtered]);

  const activeCount = accounts.filter((a) => a.isActive).length;

  if (loading) return <BrandLoader />;

  if (accounts.length === 0) {
    const TYPE_BG: Record<string, string> = {
      asset: "bg-blue-500/10 dark:bg-blue-500/15",
      liability: "bg-orange-500/10 dark:bg-orange-500/15",
      equity: "bg-purple-500/10 dark:bg-purple-500/15",
      revenue: "bg-emerald-500/10 dark:bg-emerald-500/15",
      expense: "bg-red-500/10 dark:bg-red-500/15",
    };
    const TYPE_DOT: Record<string, string> = {
      asset: "bg-blue-500",
      liability: "bg-orange-500",
      equity: "bg-purple-500",
      revenue: "bg-emerald-500",
      expense: "bg-red-500",
    };
    const TYPE_EXAMPLES: Record<string, string[]> = {
      asset: ["1000 · Cash", "1100 · Accounts Receivable", "1200 · Equipment", "1300 · Inventory"],
      liability: ["2000 · Accounts Payable", "2100 · Loans", "2200 · Credit Cards"],
      equity: ["3000 · Owner Capital", "3100 · Retained Earnings", "3200 · Drawings"],
      revenue: ["4000 · Sales Revenue", "4100 · Service Income", "4200 · Interest"],
      expense: ["5000 · Rent", "5100 · Payroll", "5200 · Utilities", "5300 · Supplies"],
    };

    return (
      <ContentReveal className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Chart of Accounts</h2>
          <Button
            onClick={() => openDrawer("account")}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New Account
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {ALL_TYPES.map((type) => (
            <div
              key={type}
              className={`rounded-xl ${TYPE_BG[type]} p-4 space-y-3`}
            >
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${TYPE_DOT[type]}`} />
                <p className="text-sm font-semibold capitalize">{type}</p>
              </div>
              <div className="space-y-1">
                {TYPE_EXAMPLES[type].map((ex) => (
                  <p key={ex} className="text-[12px] text-muted-foreground font-mono">{ex}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ContentReveal>
    );
  }

  const hasFilters = search || typeFilter !== "all";

  return (
    <ContentReveal className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Chart of Accounts</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {accounts.length} accounts · {activeCount} active
          </p>
        </div>
        <Button
          onClick={() => openDrawer("account")}
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="mr-2 size-4" />
          New Account
        </Button>
      </div>

      {/* Distribution bar */}
      <div className="space-y-2">
        <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
          {ALL_TYPES.map((type) => {
            const count = accounts.filter((a) => a.type === type).length;
            if (count === 0) return null;
            return (
              <div
                key={type}
                className={`${TYPE_META[type].dot} first:rounded-l-full last:rounded-r-full`}
                style={{ flex: count }}
              />
            );
          })}
        </div>
        <div className="flex gap-4 flex-wrap">
          {ALL_TYPES.map((type) => {
            const count = accounts.filter((a) => a.type === type).length;
            return (
              <div key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`size-2 rounded-full ${TYPE_META[type].dot}`} />
                <span className="capitalize">{type}</span>
                <span className="tabular-nums font-medium text-foreground">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <Tabs value={typeFilter} onValueChange={setTypeFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="asset">Asset</TabsTrigger>
            <TabsTrigger value="liability">Liability</TabsTrigger>
            <TabsTrigger value="equity">Equity</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="expense">Expense</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-9 w-44 text-xs">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="code:asc">Code (ascending)</SelectItem>
              <SelectItem value="code:desc">Code (descending)</SelectItem>
              <SelectItem value="name:asc">Name (A-Z)</SelectItem>
              <SelectItem value="name:desc">Name (Z-A)</SelectItem>
              <SelectItem value="type:asc">Type (A-Z)</SelectItem>
              <SelectItem value="type:desc">Type (Z-A)</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => {
                setSearch("");
                setTypeFilter("all");
              }}
            >
              <X className="mr-1 size-3" />
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Grouped accounts */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">No accounts match your filters.</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-xs"
            onClick={() => {
              setSearch("");
              setTypeFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {ALL_TYPES.map((type) => {
            const items = grouped[type];
            if (items.length === 0) return null;
            const meta = TYPE_META[type];
            return (
              <div key={type} className={`rounded-xl border ${meta.border} overflow-hidden`}>
                <div className={`${meta.bg} px-4 py-2.5 flex items-center gap-2`}>
                  <span className={`size-2 rounded-full ${meta.dot}`} />
                  <h3 className={`text-sm font-semibold capitalize ${meta.text}`}>{type}</h3>
                  <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                    {items.length} account{items.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="divide-y">
                  {items.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => router.push(`/accounting/accounts/${account.id}`)}
                      className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-muted/50 transition-colors group"
                    >
                      <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">{account.code}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{account.name}</p>
                        {account.description && (
                          <p className="text-xs text-muted-foreground truncate">{account.description}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{account.currencyCode}</span>
                      {!account.isActive && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Inactive</span>
                      )}
                      <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ContentReveal>
  );
}

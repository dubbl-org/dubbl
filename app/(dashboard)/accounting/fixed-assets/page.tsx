"use client";

import { useState, useEffect, useMemo } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useRouter } from "next/navigation";
import { Plus, Play, Search, X, Building2, TrendingDown, Package } from "lucide-react";
import { toast } from "sonner";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

interface FixedAsset {
  id: string;
  name: string;
  assetNumber: string;
  purchaseDate: string;
  purchasePrice: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  depreciationMethod: string;
  status: string;
}

const statusColors: Record<string, string> = {
  active:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  fully_depreciated:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  disposed:
    "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  fully_depreciated: "Fully Depreciated",
  disposed: "Disposed",
};

const methodLabels: Record<string, string> = {
  straight_line: "Straight Line",
  declining_balance: "Declining Balance",
};

function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DepreciationBar({
  cost,
  nbv,
  className,
}: {
  cost: number;
  nbv: number;
  className?: string;
}) {
  if (cost === 0) return null;
  const depPct = Math.min(((cost - nbv) / cost) * 100, 100);
  const nbvPct = 100 - depPct;
  return (
    <div
      className={cn(
        "h-1.5 w-full rounded-full overflow-hidden flex bg-muted",
        className
      )}
    >
      <div
        className="bg-emerald-500 h-full transition-all"
        style={{ width: `${nbvPct}%` }}
      />
      <div
        className={cn("h-full transition-all", depPct >= 100 ? "bg-red-500" : "bg-amber-400")}
        style={{ width: `${depPct}%` }}
      />
    </div>
  );
}

function buildColumns(): Column<FixedAsset>[] {
  return [
    {
      key: "assetNumber",
      header: "Asset #",
      className: "w-28",
      render: (r) => (
        <span className="font-mono text-sm">{r.assetNumber}</span>
      ),
    },
    {
      key: "name",
      header: "Name",
      render: (r) => (
        <span className="text-sm font-medium">{r.name}</span>
      ),
    },
    {
      key: "purchaseDate",
      header: "Purchased",
      className: "w-32",
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(r.purchaseDate)}
        </span>
      ),
    },
    {
      key: "depreciationMethod",
      header: "Method",
      className: "w-32",
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {methodLabels[r.depreciationMethod] || r.depreciationMethod}
        </span>
      ),
    },
    {
      key: "purchasePrice",
      header: "Cost",
      className: "w-28 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {formatMoney(r.purchasePrice)}
        </span>
      ),
    },
    {
      key: "depreciation",
      header: "Depreciation",
      className: "w-36",
      render: (r) => {
        const pct =
          r.purchasePrice > 0
            ? Math.round(
                ((r.purchasePrice - r.netBookValue) / r.purchasePrice) * 100
              )
            : 0;
        return (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-mono tabular-nums text-muted-foreground">
                {pct}%
              </span>
              <span className="font-mono tabular-nums text-red-500">
                -{formatMoney(r.accumulatedDepreciation)}
              </span>
            </div>
            <DepreciationBar cost={r.purchasePrice} nbv={r.netBookValue} />
          </div>
        );
      },
    },
    {
      key: "netBookValue",
      header: "Book Value",
      className: "w-28 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {formatMoney(r.netBookValue)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "w-36",
      render: (r) => (
        <Badge variant="outline" className={statusColors[r.status] || ""}>
          {statusLabels[r.status] || r.status}
        </Badge>
      ),
    },
  ];
}

export default function FixedAssetsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [allAssets, setAllAssets] = useState<FixedAsset[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [runningDepreciation, setRunningDepreciation] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  useDocumentTitle("Accounting \u00B7 Fixed Assets");

  const columns = useMemo(() => buildColumns(), []);

  // Fetch all assets (for counts) on mount
  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/fixed-assets`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setAllAssets(data.data);
      });
  }, []);

  // Fetch filtered assets
  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;

    setRefetching(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);

    fetch(`/api/v1/fixed-assets?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.data) {
          setAssets(data.data);
          // Keep allAssets in sync when fetching "all"
          if (statusFilter === "all") setAllAssets(data.data);
        }
      })
      .then(() => devDelay())
      .finally(() => {
        if (!cancelled) {
          setInitialLoad(false);
          setRefetching(false);
          setFetchKey((k) => k + 1);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  async function handleRunDepreciation() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setRunningDepreciation(true);
    try {
      const res = await fetch("/api/v1/fixed-assets/run-depreciation", {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `Depreciation run complete: ${data.processed} assets processed`
        );
        window.location.reload();
      } else {
        toast.error(typeof data.error === "string" ? data.error : "Failed to run depreciation");
      }
    } catch {
      toast.error("Failed to run depreciation");
    } finally {
      setRunningDepreciation(false);
    }
  }

  // Client-side search filter
  const filteredAssets = useMemo(() => {
    if (!debouncedSearch) return assets;
    const q = debouncedSearch.toLowerCase();
    return assets.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.assetNumber.toLowerCase().includes(q)
    );
  }, [assets, debouncedSearch]);

  const [searchKey, setSearchKey] = useState(0);
  useEffect(() => {
    setSearchKey((k) => k + 1);
  }, [debouncedSearch]);

  // Stats from all assets (not filtered)
  const totalCost = allAssets.reduce((sum, a) => sum + a.purchasePrice, 0);
  const totalNBV = allAssets.reduce((sum, a) => sum + a.netBookValue, 0);
  const totalAccDep = allAssets.reduce(
    (sum, a) => sum + a.accumulatedDepreciation,
    0
  );
  const nbvPct = totalCost > 0 ? Math.round((totalNBV / totalCost) * 100) : 0;
  const depPct = totalCost > 0 ? Math.round((totalAccDep / totalCost) * 100) : 0;

  // Tab counts from all assets
  const countByStatus = useMemo(() => {
    const counts: Record<string, number> = {
      all: allAssets.length,
      active: 0,
      fully_depreciated: 0,
      disposed: 0,
    };
    for (const a of allAssets) {
      if (counts[a.status] !== undefined) counts[a.status]++;
    }
    return counts;
  }, [allAssets]);

  const pendingSearch = search !== debouncedSearch;

  if (initialLoad) return <BrandLoader />;

  // Empty state
  if (
    !initialLoad &&
    !refetching &&
    allAssets.length === 0 &&
    statusFilter === "all"
  ) {
    return (
      <ContentReveal>
        <div className="flex flex-col items-center gap-10 pt-16 pb-12">
          {/* Asset lifecycle stepper */}
          <div className="w-full max-w-xl">
            <div className="grid grid-cols-3 gap-0">
              {[
                {
                  step: "1",
                  label: "Add assets",
                  sub: "Register your equipment, vehicles, and property",
                  color: "bg-blue-500",
                  ring: "ring-blue-200 dark:ring-blue-900",
                },
                {
                  step: "2",
                  label: "Set depreciation",
                  sub: "Choose method and useful life for each asset",
                  color: "bg-amber-500",
                  ring: "ring-amber-200 dark:ring-amber-900",
                },
                {
                  step: "3",
                  label: "Track value",
                  sub: "Monitor book values and run depreciation monthly",
                  color: "bg-emerald-500",
                  ring: "ring-emerald-200 dark:ring-emerald-900",
                },
              ].map(({ step, label, sub, color, ring }, i) => (
                <div
                  key={step}
                  className="flex flex-col items-center text-center relative"
                >
                  {i < 2 && (
                    <div className="absolute top-4 left-[calc(50%+16px)] w-[calc(100%-32px)] h-px bg-border" />
                  )}
                  <div
                    className={`relative z-10 flex size-8 items-center justify-center rounded-full ${color} ring-4 ${ring} text-white text-xs font-bold`}
                  >
                    {step}
                  </div>
                  <p className="mt-3 text-sm font-medium">{label}</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-[150px] leading-relaxed">
                    {sub}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-tight">
              Track your fixed assets
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Add your first asset to start tracking depreciation and book
              values.
            </p>
            <Button
              onClick={() => openDrawer("fixedAsset")}
              size="lg"
              className="mt-5 bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              Add Asset
            </Button>
          </div>

          {/* Preview stat cards (empty) */}
          <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-3 gap-3 opacity-40">
            {[
              { label: "Total Cost", value: "$0.00" },
              { label: "Net Book Value", value: "$0.00" },
              { label: "Depreciation", value: "$0.00" },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded-lg border border-dashed p-3 text-center"
              >
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-sm font-mono font-medium text-muted-foreground">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      {/* Inline stats + depreciation bar */}
      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Total Cost
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatMoney(totalCost)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Net Book Value
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {formatMoney(totalNBV)}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {nbvPct}%
                </span>
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Accumulated Depr.
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-red-500">
                -{formatMoney(totalAccDep)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Assets
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {allAssets.length}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRunDepreciation}
              disabled={runningDepreciation}
            >
              <Play className="mr-2 size-4" />
              {runningDepreciation ? "Running..." : "Run Depreciation"}
            </Button>
            <Button
              size="sm"
              onClick={() => openDrawer("fixedAsset")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              Add Asset
            </Button>
          </div>
        </div>

        {/* Overall depreciation progress bar */}
        {totalCost > 0 && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Depreciation Progress
              </p>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                {depPct}% depreciated
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-muted">
              <div
                className="bg-emerald-500 h-full transition-all"
                style={{ width: `${nbvPct}%` }}
              />
              <div
                className={cn(
                  "h-full transition-all",
                  depPct >= 100 ? "bg-red-500" : "bg-amber-400"
                )}
                style={{ width: `${depPct}%` }}
              />
            </div>
            <div className="flex items-center gap-6 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="inline-block size-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">
                  Net Book Value · {formatMoney(totalNBV)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-block size-2 rounded-full",
                    depPct >= 100 ? "bg-red-500" : "bg-amber-400"
                  )}
                />
                <span className="text-muted-foreground">
                  Depreciated · {formatMoney(totalAccDep)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* Table section */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="overflow-x-auto">
              <TabsTrigger value="all" className="whitespace-nowrap">
                All{" "}
                <span className="ml-1 text-muted-foreground">
                  {countByStatus.all}
                </span>
              </TabsTrigger>
              <TabsTrigger value="active" className="whitespace-nowrap">
                Active{" "}
                <span className="ml-1 text-muted-foreground">
                  {countByStatus.active}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="fully_depreciated"
                className="whitespace-nowrap"
              >
                Fully Depreciated{" "}
                <span className="ml-1 text-muted-foreground">
                  {countByStatus.fully_depreciated}
                </span>
              </TabsTrigger>
              <TabsTrigger value="disposed" className="whitespace-nowrap">
                Disposed{" "}
                <span className="ml-1 text-muted-foreground">
                  {countByStatus.disposed}
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name or asset #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-64 pl-8 text-xs"
            />
          </div>
          {search && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => {
                setSearch("");
              }}
            >
              <X className="mr-1 size-3" />
              Clear
            </Button>
          )}
        </div>

        {refetching || pendingSearch ? (
          <BrandLoader className="h-48" />
        ) : (
          <ContentReveal key={`${fetchKey}-${searchKey}`}>
            <DataTable
              columns={columns}
              data={filteredAssets}
              loading={false}
              emptyMessage="No assets match your filters."
              onRowClick={(r) =>
                router.push(`/accounting/fixed-assets/${r.id}`)
              }
            />
          </ContentReveal>
        )}

        {!refetching && !pendingSearch && filteredAssets.length > 0 && (
          <div className="pt-1">
            <p className="text-xs text-muted-foreground">
              Showing {filteredAssets.length} asset
              {filteredAssets.length !== 1 ? "s" : ""}
              {debouncedSearch && ` matching "${debouncedSearch}"`}
            </p>
          </div>
        )}
      </div>
    </ContentReveal>
  );
}

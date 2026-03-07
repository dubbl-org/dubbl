"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Building2, Play } from "lucide-react";
import { toast } from "sonner";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";
import { BlurReveal } from "@/components/ui/blur-reveal";

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
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  fully_depreciated: "border-amber-200 bg-amber-50 text-amber-700",
  disposed: "border-gray-200 bg-gray-50 text-gray-700",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  fully_depreciated: "Fully Depreciated",
  disposed: "Disposed",
};

const columns: Column<FixedAsset>[] = [
  {
    key: "assetNumber",
    header: "Asset #",
    className: "w-28",
    render: (r) => <span className="font-mono text-sm">{r.assetNumber}</span>,
  },
  {
    key: "name",
    header: "Name",
    render: (r) => <span className="text-sm font-medium">{r.name}</span>,
  },
  {
    key: "purchaseDate",
    header: "Purchase Date",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.purchaseDate}</span>,
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
    key: "netBookValue",
    header: "Net Book Value",
    className: "w-32 text-right",
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

export default function FixedAssetsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [runningDepreciation, setRunningDepreciation] = useState(false);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);

    fetch(`/api/v1/fixed-assets?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setAssets(data.data);
      })
      .finally(() => setLoading(false));
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
        toast.success(`Depreciation run complete: ${data.processed} assets processed`);
        // Refresh list
        setStatusFilter(statusFilter);
        window.location.reload();
      } else {
        toast.error(data.error || "Failed to run depreciation");
      }
    } catch {
      toast.error("Failed to run depreciation");
    } finally {
      setRunningDepreciation(false);
    }
  }

  const totalCost = assets.reduce((sum, a) => sum + a.purchasePrice, 0);
  const totalNBV = assets.reduce((sum, a) => sum + a.netBookValue, 0);
  const totalAccDep = assets.reduce(
    (sum, a) => sum + a.accumulatedDepreciation,
    0
  );

  if (!loading && assets.length === 0 && statusFilter === "all") {
    return (
      <BlurReveal className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Fixed Assets</h2>
          <Button
            onClick={() => openDrawer("fixedAsset")}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            Add Asset
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Cost", value: "$0.00" },
            { label: "Net Book Value", value: "$0.00" },
            { label: "Accumulated Depreciation", value: "$0.00" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border bg-card p-4">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className="mt-1.5 text-xl font-mono font-semibold tabular-nums text-muted-foreground/30">{value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border overflow-hidden opacity-50">
          <div className="grid grid-cols-[1fr_120px_120px_120px_100px] gap-px bg-muted text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            <div className="bg-card px-4 py-2.5">Asset</div>
            <div className="bg-card px-4 py-2.5">Purchase Date</div>
            <div className="bg-card px-4 py-2.5 text-right">Cost</div>
            <div className="bg-card px-4 py-2.5 text-right">Book Value</div>
            <div className="bg-card px-4 py-2.5">Status</div>
          </div>
          {[
            { name: "Office Laptop", date: "Jan 2025", cost: "$1,200", nbv: "$900", status: "Active" },
            { name: "Delivery Van", date: "Mar 2024", cost: "$28,000", nbv: "$21,000", status: "Active" },
            { name: "Office Furniture", date: "Jun 2023", cost: "$4,500", nbv: "$2,250", status: "Active" },
          ].map((row) => (
            <div key={row.name} className="grid grid-cols-[1fr_120px_120px_120px_100px] gap-px bg-muted">
              <div className="bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground">{row.name}</div>
              <div className="bg-card px-4 py-2.5 text-sm text-muted-foreground">{row.date}</div>
              <div className="bg-card px-4 py-2.5 text-sm font-mono tabular-nums text-right text-muted-foreground">{row.cost}</div>
              <div className="bg-card px-4 py-2.5 text-sm font-mono tabular-nums text-right text-muted-foreground">{row.nbv}</div>
              <div className="bg-card px-4 py-2.5 text-xs text-emerald-600">{row.status}</div>
            </div>
          ))}
        </div>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal className="space-y-6 sm:space-y-10">
      <Section title="Overview" description="A summary of your fixed assets, book values, and accumulated depreciation.">
        <div className="space-y-4">
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
            <StatCard title="Total Cost" value={formatMoney(totalCost)} icon={Building2} />
            <StatCard
              title="Net Book Value"
              value={formatMoney(totalNBV)}
              icon={Building2}
            />
            <StatCard
              title="Accumulated Depreciation"
              value={formatMoney(totalAccDep)}
              icon={Building2}
              changeType="negative"
            />
          </div>
          <div className="flex justify-end flex-wrap gap-2">
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
      </Section>

      <div className="h-px bg-border" />

      <Section title="Fixed Assets" description="View and manage all your capital assets and their depreciation status.">
        <div className="space-y-4">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="fully_depreciated">Fully Depreciated</TabsTrigger>
              <TabsTrigger value="disposed">Disposed</TabsTrigger>
            </TabsList>
          </Tabs>

          <DataTable
            columns={columns}
            data={assets}
            loading={loading}
            emptyMessage="No assets found."
            onRowClick={(r) => router.push(`/accounting/fixed-assets/${r.id}`)}
          />
        </div>
      </Section>
    </BlurReveal>
  );
}

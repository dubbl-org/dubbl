"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Package, AlertTriangle } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";


interface InventoryItem {
  id: string;
  code: string;
  name: string;
  sku: string | null;
  purchasePrice: number;
  salePrice: number;
  quantityOnHand: number;
  reorderPoint: number;
  isActive: boolean;
}

const columns: Column<InventoryItem>[] = [
  {
    key: "code",
    header: "Code",
    className: "w-28",
    render: (r) => <span className="font-mono text-sm">{r.code}</span>,
  },
  {
    key: "name",
    header: "Name",
    render: (r) => <span className="text-sm font-medium">{r.name}</span>,
  },
  {
    key: "sku",
    header: "SKU",
    className: "w-28",
    render: (r) => (
      <span className="text-sm text-muted-foreground">{r.sku || "-"}</span>
    ),
  },
  {
    key: "quantity",
    header: "Qty",
    className: "w-20 text-right",
    render: (r) => {
      const isLow = r.quantityOnHand <= r.reorderPoint;
      return (
        <span className={`text-sm font-mono tabular-nums ${isLow ? "text-red-600 font-medium" : ""}`}>
          {r.quantityOnHand}
        </span>
      );
    },
  },
  {
    key: "purchasePrice",
    header: "Cost",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">{formatMoney(r.purchasePrice)}</span>
    ),
  },
  {
    key: "salePrice",
    header: "Sale Price",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">{formatMoney(r.salePrice)}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    className: "w-24",
    render: (r) => {
      if (r.quantityOnHand <= r.reorderPoint) {
        return (
          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
            Low Stock
          </Badge>
        );
      }
      return (
        <Badge
          variant="outline"
          className={
            r.isActive
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-gray-200 bg-gray-50 text-gray-700"
          }
        >
          {r.isActive ? "Active" : "Inactive"}
        </Badge>
      );
    },
  },
];

export default function InventoryPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const params = new URLSearchParams();
    if (search) params.set("search", search);

    fetch(`/api/v1/inventory?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setItems(data.data);
      })
      .then(() => devDelay())
      .finally(() => setLoading(false));
  }, [search]);

  const totalValue = items.reduce(
    (sum, i) => sum + i.quantityOnHand * i.purchasePrice,
    0
  );
  const lowStockCount = items.filter(
    (i) => i.quantityOnHand <= i.reorderPoint
  ).length;

  if (loading) return <BrandLoader />;

  if (!loading && items.length === 0 && !search) {
    return (
      <ContentReveal className="space-y-10">
        <Section title="Inventory" description="Manage products and stock levels.">
          <EmptyState
            icon={Package}
            title="No inventory items yet"
            description="Add your first product or item to start tracking inventory."
          >
            <Button
              onClick={() => openDrawer("inventory")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Item
            </Button>
          </EmptyState>
        </Section>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal>
    <div className="space-y-6 sm:space-y-10">
      <Section title="Overview" description="A summary of your inventory levels and stock value.">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <StatCard title="Total Items" value={items.length.toString()} icon={Package} />
            <StatCard title="Total Value" value={formatMoney(totalValue)} icon={Package} />
            <StatCard
                title="Low Stock"
                value={lowStockCount.toString()}
                icon={AlertTriangle}
                changeType={lowStockCount > 0 ? "negative" : "neutral"}
              />
          </div>
          <div className="flex flex-wrap justify-end">
            <Button
              size="sm"
              onClick={() => openDrawer("inventory")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Item
            </Button>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Items" description="View and manage all inventory items.">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Input
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:max-w-sm"
            />
          </div>

          <DataTable
              columns={columns}
              data={items}
              loading={loading}
              emptyMessage="No inventory items found."
              onRowClick={(r) => router.push(`/inventory/${r.id}`)}
            />
        </div>
      </Section>
    </div>
    </ContentReveal>
  );
}

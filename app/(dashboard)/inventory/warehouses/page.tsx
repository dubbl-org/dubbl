"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, MotionConfig } from "motion/react";
import {
  Warehouse,
  Pencil,
  Trash2,
  MapPin,
  Star,
  Building2,
  CheckCircle2,
  XCircle,
  Plus,
  Package,
  ArrowRight,
  Search,
  ArrowUpDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@/lib/utils";

interface WarehouseItem {
  id: string;
  name: string;
  code: string;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
}

type StatusFilter = "all" | "active" | "inactive";
type SortKey = "name" | "code" | "default";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "code", label: "Code" },
  { value: "default", label: "Default first" },
];

export default function WarehousesPage() {
  const { open: openDrawer } = useCreateDrawer();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Search, filter, sort
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const pendingSearch = search !== debouncedSearch;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Form fields
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formAddress, setFormAddress] = useState("");

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  const fetchWarehouses = useCallback(async () => {
    const id = localStorage.getItem("activeOrgId");
    if (!id) return;
    const isRefetch = !loading;
    if (isRefetch) setRefetching(true);

    try {
      const res = await fetch("/api/v1/warehouses", {
        headers: { "x-organization-id": id },
      });
      const data = await res.json();
      setWarehouses(data.data || []);
    } finally {
      setLoading(false);
      setRefetching(false);
      setFetchKey((k) => k + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    fetchWarehouses();
    const handler = () => fetchWarehouses();
    window.addEventListener("refetch-warehouses", handler);
    return () => window.removeEventListener("refetch-warehouses", handler);
  }, [fetchWarehouses]);

  // Re-fetch on filter/sort/search changes
  useEffect(() => {
    if (!loading) fetchWarehouses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sortBy, sortOrder, debouncedSearch]);

  // Client-side filtering + sorting
  const filtered = warehouses
    .filter((w) => {
      if (statusFilter === "active" && !w.isActive) return false;
      if (statusFilter === "inactive" && w.isActive) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const nameMatch = w.name.toLowerCase().includes(q);
        const codeMatch = w.code.toLowerCase().includes(q);
        const addrMatch = w.address?.toLowerCase().includes(q);
        if (!nameMatch && !codeMatch && !addrMatch) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dir = sortOrder === "asc" ? 1 : -1;
      switch (sortBy) {
        case "code":
          return dir * a.code.localeCompare(b.code);
        case "default":
          return (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || dir * a.name.localeCompare(b.name);
        case "name":
        default:
          return dir * a.name.localeCompare(b.name);
      }
    });

  // Stats (unfiltered)
  const totalWarehouses = warehouses.length;
  const activeCount = warehouses.filter((w) => w.isActive).length;
  const inactiveCount = warehouses.filter((w) => !w.isActive).length;
  const defaultWarehouse = warehouses.find((w) => w.isDefault);
  const withAddress = warehouses.filter((w) => w.address).length;

  function openEdit(warehouse: WarehouseItem) {
    setEditing(warehouse);
    setFormName(warehouse.name);
    setFormCode(warehouse.code);
    setFormAddress(warehouse.address || "");
    setSheetOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);

    try {
      const payload = { name: formName, code: formCode, address: formAddress || null };

      if (editing) {
        const res = await fetch(`/api/v1/warehouses/${editing.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": orgId,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update warehouse");
        }
        toast.success("Warehouse updated");
      } else {
        const res = await fetch("/api/v1/warehouses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": orgId,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create warehouse");
        }
        toast.success("Warehouse created");
      }

      setSheetOpen(false);
      setEditing(null);
      await fetchWarehouses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(warehouse: WarehouseItem) {
    if (!orgId) return;

    const confirmed = await confirm({
      title: `Delete "${warehouse.name}"?`,
      description:
        "This warehouse will be permanently removed. This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/v1/warehouses/${warehouse.id}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete warehouse");
      }
      await fetchWarehouses();
      toast.success("Warehouse deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function handleSetDefault(warehouse: WarehouseItem) {
    if (!orgId) return;

    try {
      const res = await fetch(`/api/v1/warehouses/${warehouse.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to set default");
      }
      await fetchWarehouses();
      toast.success(`"${warehouse.name}" set as default`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set default");
    }
  }

  function toggleSortOrder() {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  if (loading) return <BrandLoader />;

  if (warehouses.length === 0) {
    return (
      <ContentReveal>
        <div className="pt-12 pb-12 space-y-10">
          {/* Top: title + CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Warehouses</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Organize inventory across physical locations. Track what is stored where.
              </p>
            </div>
            <Button
              onClick={() => openDrawer("warehouse")}
              className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            >
              <Plus className="mr-2 size-4" />
              New Warehouse
            </Button>
          </div>

          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
            {/* Left: mock warehouse card */}
            <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
              <div className="bg-muted/30 px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Example warehouse
                </p>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                    <Warehouse className="size-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Main Warehouse</p>
                    <p className="text-xs text-muted-foreground font-mono">WH-001</p>
                  </div>
                  <Badge variant="outline" className="ml-auto bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 text-[11px]">
                    Default
                  </Badge>
                </div>
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="size-3 mt-0.5 shrink-0" />
                  <span>123 Storage Lane, Industrial District</span>
                </div>
                <div className="h-px bg-border" />
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: "Items", value: "248" },
                    { label: "Value", value: "$12,400" },
                    { label: "Utilization", value: "73%" },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg bg-muted/50 px-2 py-2">
                      <p className="text-sm font-bold font-mono tabular-nums">{value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: benefits */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Why use warehouses
              </p>
              {[
                {
                  title: "Multi-location tracking",
                  desc: "Know exactly how much stock is in each warehouse at any time.",
                  icon: Building2,
                  color: "border-l-emerald-400",
                },
                {
                  title: "Stock transfers",
                  desc: "Move inventory between locations and keep an audit trail.",
                  icon: ArrowRight,
                  color: "border-l-blue-400",
                },
                {
                  title: "Default receiving",
                  desc: "Set a default warehouse so new purchases go to the right place.",
                  icon: Star,
                  color: "border-l-amber-400",
                },
                {
                  title: "Per-location stock takes",
                  desc: "Run physical counts per warehouse instead of all at once.",
                  icon: Package,
                  color: "border-l-violet-400",
                },
              ].map(({ title, desc, icon: Icon, color }) => (
                <div key={title} className={`rounded-lg border border-l-[3px] ${color} bg-card px-4 py-3`}>
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium">{title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 ml-[22px]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {confirmDialog}
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      <PageHeader
        title="Warehouses"
        description="Manage your warehouse locations for inventory tracking and stock allocation."
      />

      {/* Stats + default warehouse */}
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        {/* Left: summary with visual breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-xl border bg-card p-5 flex flex-col justify-between gap-4"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="size-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Overview</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-3xl font-bold font-mono tabular-nums truncate">{totalWarehouses}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total</p>
            </div>
            <div>
              <p className="text-3xl font-bold font-mono tabular-nums truncate text-emerald-600 dark:text-emerald-400">{activeCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Active</p>
            </div>
            <div>
              <p className="text-3xl font-bold font-mono tabular-nums truncate text-zinc-500">{inactiveCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Inactive</p>
            </div>
          </div>
          {/* Capacity bar */}
          <div className="space-y-1.5">
            <div className="flex h-2 rounded-full overflow-hidden bg-muted">
              {activeCount > 0 && (
                <div
                  className="bg-emerald-500 transition-all duration-500"
                  style={{ width: `${(activeCount / totalWarehouses) * 100}%` }}
                />
              )}
              {inactiveCount > 0 && (
                <div
                  className="bg-zinc-300 dark:bg-zinc-600 transition-all duration-500"
                  style={{ width: `${(inactiveCount / totalWarehouses) * 100}%` }}
                />
              )}
            </div>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" />Active ({activeCount})</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />Inactive ({inactiveCount})</span>
              <span className="flex items-center gap-1.5"><MapPin className="size-2.5" />With address ({withAddress})</span>
            </div>
          </div>
        </motion.div>

        {/* Right: quick info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="rounded-xl border bg-card p-4 flex flex-col justify-between"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold font-mono tabular-nums truncate text-emerald-600 dark:text-emerald-400">{activeCount}</p>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mt-0.5">Active</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.09 }}
            className="rounded-xl border bg-card p-4 flex flex-col justify-between"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
              <XCircle className="size-4 text-zinc-500" />
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold font-mono tabular-nums truncate text-zinc-500">{inactiveCount}</p>
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mt-0.5">Inactive</p>
            </div>
          </motion.div>

          {/* Default warehouse highlight - spans 2 cols */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.13 }}
            className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20 p-4 flex items-center gap-3"
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
              <Star className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Default Warehouse</p>
              {defaultWarehouse ? (
                <p className="text-sm font-medium truncate mt-0.5">
                  {defaultWarehouse.name} <span className="text-muted-foreground font-mono text-xs">({defaultWarehouse.code})</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-0.5">None set</p>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="inactive">Inactive</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => openDrawer("warehouse")}
          >
            <Plus className="size-3" />
            New Warehouse
          </Button>
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, code, or address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8 h-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-8 w-full sm:w-[150px] text-xs">
              <ArrowUpDown className="size-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={toggleSortOrder}>
            <ArrowUpDown className={cn("size-3.5 transition-transform", sortOrder === "asc" && "rotate-180")} />
          </Button>
        </div>
      </div>

      {/* Warehouse cards */}
      {refetching || pendingSearch ? (
        <div className="flex items-center justify-center py-20">
          <div className="brand-loader" aria-label="Loading">
            <div className="brand-loader-circle brand-loader-circle-1" />
            <div className="brand-loader-circle brand-loader-circle-2" />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <ContentReveal key={fetchKey}>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <Warehouse className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No warehouses found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Try a different search term" : "No warehouses match this filter"}
            </p>
          </div>
        </ContentReveal>
      ) : (
        <MotionConfig reducedMotion="never">
          <motion.div
            key={fetchKey}
            initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "opacity, transform, filter" }}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((warehouse) => (
                <div
                  key={warehouse.id}
                  className="rounded-xl border bg-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg",
                          warehouse.isActive
                            ? "bg-emerald-50 dark:bg-emerald-950/40"
                            : "bg-muted"
                        )}
                      >
                        <Warehouse
                          className={cn(
                            "size-4",
                            warehouse.isActive
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground"
                          )}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {warehouse.name}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {warehouse.code}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {warehouse.isDefault && (
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 text-[11px]"
                        >
                          Default
                        </Badge>
                      )}
                      {!warehouse.isActive && (
                        <Badge variant="outline" className="text-[11px]">
                          Inactive
                        </Badge>
                      )}
                    </div>
                  </div>

                  {warehouse.address && (
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="size-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{warehouse.address}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 pt-1 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => openEdit(warehouse)}
                    >
                      <Pencil className="size-3 mr-1" />
                      Edit
                    </Button>
                    {!warehouse.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleSetDefault(warehouse)}
                      >
                        <Star className="size-3 mr-1" />
                        Set Default
                      </Button>
                    )}
                    {!warehouse.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                        onClick={() => handleDelete(warehouse)}
                      >
                        <Trash2 className="size-3 mr-1" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </MotionConfig>
      )}

      {/* Edit Sheet */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(v) => {
          if (!v) {
            setSheetOpen(false);
            setEditing(null);
          }
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {editing ? "Edit Warehouse" : "New Warehouse"}
            </SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSave} className="space-y-4 px-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Main Warehouse"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="e.g. WH-001"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                placeholder="e.g. 123 Storage Ln, City"
              />
            </div>
          </form>
          <SheetFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSheetOpen(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving
                ? "Saving..."
                : editing
                  ? "Save Changes"
                  : "Create"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {confirmDialog}
    </ContentReveal>
  );
}

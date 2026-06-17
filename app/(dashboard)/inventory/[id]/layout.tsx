"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, Package, ArrowUpDown, Power, PowerOff, Settings2, Clock, Truck, Layers, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";
import { setEntityTitle } from "@/lib/hooks/use-entity-title";
import { cn } from "@/lib/utils";

export interface InventoryItemDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  categoryId: string | null;
  sku: string | null;
  imageUrl: string | null;
  purchasePrice: number;
  salePrice: number;
  quantityOnHand: number;
  reorderPoint: number;
  totalValue?: number;
  isActive: boolean;
}

interface InventoryItemContextValue {
  item: InventoryItemDetail;
  setItem: (fn: (prev: InventoryItemDetail) => InventoryItemDetail) => void;
  refetch: () => void;
}

const InventoryItemContext = createContext<InventoryItemContextValue | null>(null);

export function useInventoryItem() {
  const ctx = useContext(InventoryItemContext);
  if (!ctx) throw new Error("useInventoryItem must be used within inventory item layout");
  return ctx;
}

const PAGE_TABS = [
  { value: "details", label: "Details", icon: Settings2, href: (id: string) => `/inventory/${id}` },
  { value: "history", label: "History", icon: Clock, href: (id: string) => `/inventory/${id}/history` },
  { value: "suppliers", label: "Suppliers", icon: Truck, href: (id: string) => `/inventory/${id}/suppliers` },
  { value: "variants", label: "Variants", icon: Layers, href: (id: string) => `/inventory/${id}/variants` },
] as const;

export default function InventoryItemLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const [item, setItemRaw] = useState<InventoryItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustment, setAdjustment] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  // "Write down value" sheet: lower the book value without changing the count.
  const [writeDownOpen, setWriteDownOpen] = useState(false);
  const [writeDownAmount, setWriteDownAmount] = useState("");
  const [writeDownReason, setWriteDownReason] = useState("");
  const [writeDownBusy, setWriteDownBusy] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchItem = useCallback(() => {
    if (!orgId) return;
    fetch(`/api/v1/inventory/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.inventoryItem) {
          setItemRaw(data.inventoryItem);
          setEntityTitle(data.inventoryItem.name);
        }
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  const setItem = (fn: (prev: InventoryItemDetail) => InventoryItemDetail) => {
    setItemRaw((prev) => prev ? fn(prev) : prev);
  };

  async function handleAdjust() {
    if (!orgId) return;
    const adj = parseInt(adjustment);
    if (!adj || !adjustReason.trim()) {
      toast.error("Enter a valid adjustment and reason");
      return;
    }

    try {
      const res = await fetch(`/api/v1/inventory/${id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ adjustment: adj, reason: adjustReason }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to adjust");
      }

      const data = await res.json();
      setItemRaw(data.inventoryItem);
      setAdjustOpen(false);
      setAdjustment("");
      setAdjustReason("");
      toast.success(`Count changed by ${adj > 0 ? "+" : ""}${adj}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change the count");
    }
  }

  async function handleWriteDown() {
    if (!orgId) return;
    const amount = Math.round(parseFloat(writeDownAmount || "0") * 100);
    if (!amount || amount <= 0 || !writeDownReason.trim()) {
      toast.error("Enter how much to write off and why");
      return;
    }
    setWriteDownBusy(true);
    try {
      const res = await fetch(`/api/v1/inventory/${id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          adjustmentType: "write_down",
          valueDelta: amount,
          reason: writeDownReason,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Couldn't write down the value");
      }
      const data = await res.json();
      setItemRaw(data.inventoryItem);
      setWriteDownOpen(false);
      setWriteDownAmount("");
      setWriteDownReason("");
      toast.success("Value written down");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't write down the value");
    } finally {
      setWriteDownBusy(false);
    }
  }

  async function handleToggleActive() {
    if (!orgId || !item) return;
    try {
      const res = await fetch(`/api/v1/inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItemRaw(data.inventoryItem);
      toast.success(data.inventoryItem.isActive ? "Item is now shown" : "Item is now hidden");
    } catch {
      toast.error("Couldn't update the item");
    }
  }

  if (loading) return <BrandLoader />;

  if (!item) {
    return (
      <div className="space-y-4 pt-12 text-center">
        <p className="text-sm text-muted-foreground">Item not found</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/inventory")}>
          Back to Inventory
        </Button>
      </div>
    );
  }

  const isLowStock = item.quantityOnHand <= item.reorderPoint && item.isActive;
  const stockValue = item.quantityOnHand * item.purchasePrice;
  const margin = item.purchasePrice > 0
    ? ((item.salePrice - item.purchasePrice) / item.purchasePrice * 100)
    : 0;
  const stockPercent = item.reorderPoint > 0
    ? Math.min((item.quantityOnHand / (item.reorderPoint * 3)) * 100, 100)
    : 100;

  // Determine active tab from pathname
  const activeTab = pathname.endsWith("/history")
    ? "history"
    : pathname.endsWith("/suppliers")
      ? "suppliers"
      : pathname.endsWith("/variants")
        ? "variants"
        : "details";

  return (
    <InventoryItemContext.Provider value={{ item, setItem, refetch: fetchItem }}>
      <ContentReveal>
        {/* Back link */}
        <button
          onClick={() => router.push("/inventory")}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="size-3.5" />
          Back to inventory
        </button>

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex size-10 items-center justify-center rounded-xl",
              isLowStock
                ? "bg-amber-50 dark:bg-amber-950/40"
                : "bg-emerald-50 dark:bg-emerald-950/40"
            )}>
              <Package className={cn(
                "size-5",
                isLowStock
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              )} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{item.name}</h1>
                {isLowStock && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" title="You're running low — at or below your reorder level">
                    Running low
                  </Badge>
                )}
                <Badge variant="outline" className={
                  item.isActive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : ""
                }>
                  {item.isActive ? "Shown" : "Hidden"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {item.code}{item.sku ? ` · ${item.sku}` : ""}{item.category ? ` · ${item.category}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleToggleActive}
              title={item.isActive ? "Hide this item so it stops showing in lists and pickers" : "Show this item again in lists and pickers"}
            >
              {item.isActive ? (
                <><PowerOff className="mr-1.5 size-3.5" />Hide item</>
              ) : (
                <><Power className="mr-1.5 size-3.5" />Show item</>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setWriteDownOpen(true)}
              title="The stock is worth less than you paid (damaged, expired, can't sell) — lower its value in your books without changing the count"
            >
              <TrendingDown className="mr-1.5 size-3.5" />
              Write down value
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAdjustOpen(true)}
              title="Change the number of units you have on hand (e.g. after a count, breakage, or finding extra)"
            >
              <ArrowUpDown className="mr-1.5 size-3.5" />
              Change the count
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <motion.div
            className="rounded-xl border bg-card p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Units on hand</p>
            <p className={cn(
              "mt-1.5 text-2xl font-bold font-mono tabular-nums truncate",
              isLowStock && "text-amber-600 dark:text-amber-400"
            )}>
              {item.quantityOnHand}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    isLowStock ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${stockPercent}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                Reorder at {item.reorderPoint}
              </span>
            </div>
          </motion.div>
          <motion.div
            className="rounded-xl border bg-card p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Value of stock</p>
            <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums truncate">
              {formatMoney(stockValue)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {item.quantityOnHand} x {formatMoney(item.purchasePrice)}
            </p>
          </motion.div>
          <motion.div
            className="rounded-xl border bg-card p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Selling price</p>
            <p className="mt-1.5 text-2xl font-bold font-mono tabular-nums truncate text-emerald-600 dark:text-emerald-400">
              {formatMoney(item.salePrice)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Cost {formatMoney(item.purchasePrice)}
            </p>
          </motion.div>
          <motion.div
            className="rounded-xl border bg-card p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Profit margin</p>
            <p className={cn(
              "mt-1.5 text-2xl font-bold font-mono tabular-nums truncate",
              margin > 0 ? "text-emerald-600 dark:text-emerald-400" : margin < 0 ? "text-red-600" : ""
            )}>
              {item.purchasePrice > 0 ? `${margin.toFixed(1)}%` : "-"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {item.purchasePrice > 0 ? `${formatMoney(item.salePrice - item.purchasePrice)} per unit` : "No cost set"}
            </p>
          </motion.div>
        </div>

        {/* Page tabs */}
        <nav className="-mt-2 mb-8 flex items-center gap-1 overflow-x-auto border-b border-border">
          {PAGE_TABS.map((t) => {
            const Icon = t.icon;
            const tabHref = t.href(id);
            return (
              <button
                key={t.value}
                onClick={() => router.push(tabHref)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2.5 text-[13px] font-medium transition-colors",
                  activeTab === t.value
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <ContentReveal key={pathname}>
          {children}
        </ContentReveal>

        {/* Change the count sheet */}
        <Sheet open={adjustOpen} onOpenChange={setAdjustOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Change the count</SheetTitle>
              <SheetDescription>
                Use this when your actual units on hand don&apos;t match what&apos;s
                shown — for example after a count, breakage, or finding extra.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">Units on hand now</p>
                <p className="text-xl font-bold font-mono tabular-nums truncate">{item.quantityOnHand}</p>
              </div>
              <div className="space-y-2">
                <Label>Add or remove units</Label>
                <Input
                  type="number"
                  value={adjustment}
                  onChange={(e) => setAdjustment(e.target.value)}
                  placeholder="e.g. 10 to add, -5 to remove"
                />
                {adjustment && parseInt(adjustment) !== 0 && (
                  <p className="text-xs text-muted-foreground">
                    New count: <span className="font-mono font-medium">{item.quantityOnHand + parseInt(adjustment)}</span>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Reason *</Label>
                <Input
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Stock count, breakage, found extra"
                />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
              <Button onClick={handleAdjust} className="bg-emerald-600 hover:bg-emerald-700">
                Save new count
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* Write down value sheet */}
        <Sheet open={writeDownOpen} onOpenChange={setWriteDownOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Write down value</SheetTitle>
              <SheetDescription>
                Use this when your stock is worth less than you paid (damaged,
                expired, or hard to sell). The count stays the same — only its
                value in your books goes down.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">Current value in your books</p>
                <p className="text-xl font-bold font-mono tabular-nums truncate">
                  {formatMoney(item.totalValue ?? item.quantityOnHand * item.purchasePrice)}
                </p>
              </div>
              <div className="space-y-2">
                <Label>How much to write off</Label>
                <CurrencyInput
                  prefix="$"
                  value={writeDownAmount}
                  onChange={setWriteDownAmount}
                />
              </div>
              <div className="space-y-2">
                <Label>Reason *</Label>
                <Input
                  value={writeDownReason}
                  onChange={(e) => setWriteDownReason(e.target.value)}
                  placeholder="e.g. Damaged, expired, can't sell at full price"
                />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setWriteDownOpen(false)}>Cancel</Button>
              <Button onClick={handleWriteDown} disabled={writeDownBusy} className="bg-emerald-600 hover:bg-emerald-700">
                Write down value
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </ContentReveal>
    </InventoryItemContext.Provider>
  );
}

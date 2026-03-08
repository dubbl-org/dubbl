"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Plus,
  ChevronRight,
  Loader2,
  ClipboardCheck,
  Clock,
  FileText,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

interface StockTake {
  id: string;
  name: string;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  createdAt: string;
  itemCount: number;
}

type FilterTab = "all" | "draft" | "in_progress" | "completed";

const STATUS_CONFIG: Record<
  StockTake["status"],
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className:
      "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  },
  in_progress: {
    label: "In Progress",
    className:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  completed: {
    label: "Completed",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  cancelled: {
    label: "Cancelled",
    className:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
  },
};

export default function StockTakesPage() {
  const router = useRouter();
  const [stockTakes, setStockTakes] = useState<StockTake[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    fetch("/api/v1/stock-takes", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.data) setStockTakes(data.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  async function handleCreate() {
    if (!orgId || !createName.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/v1/stock-takes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ name: createName, notes: createNotes }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create stock take");
      }

      const data = await res.json();
      setStockTakes((prev) => [data.stockTake, ...prev]);
      setCreateOpen(false);
      setCreateName("");
      setCreateNotes("");
      toast.success("Stock take created");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create stock take"
      );
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <BrandLoader />;

  const draftCount = stockTakes.filter((s) => s.status === "draft").length;
  const inProgressCount = stockTakes.filter((s) => s.status === "in_progress").length;
  const completedCount = stockTakes.filter((s) => s.status === "completed").length;
  const totalItems = stockTakes.reduce((sum, s) => sum + (s.itemCount || 0), 0);

  const stats = [
    { label: "Total Counts", value: stockTakes.length, icon: ClipboardList },
    { label: "Drafts", value: draftCount, icon: FileText, color: "text-zinc-500" },
    { label: "In Progress", value: inProgressCount, icon: Clock, color: "text-blue-600 dark:text-blue-400" },
    { label: "Completed", value: completedCount, icon: ClipboardCheck, color: "text-emerald-600 dark:text-emerald-400" },
  ];

  const filtered = stockTakes
    .filter((st) => tab === "all" || st.status === tab)
    .filter((st) =>
      !searchQuery || st.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <ContentReveal className="space-y-6">
      <PageHeader
        title="Stock Takes"
        description="Plan, conduct, and review physical inventory counts to keep your records accurate."
      >
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="mr-1.5 size-3.5" />
          New Stock Take
        </Button>
      </PageHeader>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className="rounded-xl border bg-card p-4"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <stat.icon className="size-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wide">
                {stat.label}
              </span>
            </div>
            <p className={cn(
              "mt-2 text-2xl font-bold font-mono tabular-nums",
              stat.color
            )}>
              {stat.value}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="h-px bg-border" />

      {/* Filters row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
          <TabsList>
            <TabsTrigger value="all">All ({stockTakes.length})</TabsTrigger>
            <TabsTrigger value="draft">Draft ({draftCount})</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress ({inProgressCount})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedCount})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search stock takes..."
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* List */}
      {stockTakes.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No stock takes yet"
          description="Create your first stock take to start counting inventory and reconciling stock levels."
        >
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-1.5 size-3.5" />
            New Stock Take
          </Button>
        </EmptyState>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
            <ClipboardList className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            No stock takes match your filters
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card divide-y">
          {filtered.map((st, i) => {
            const statusCfg = STATUS_CONFIG[st.status];
            return (
              <motion.div
                key={st.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className={cn(
                  "group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-200",
                  "hover:bg-muted/40"
                )}
                onClick={() =>
                  router.push(`/inventory/stock-takes/${st.id}`)
                }
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <ClipboardList className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {st.name}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] px-1.5 py-0", statusCfg.className)}
                      >
                        {statusCfg.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(st.createdAt).toLocaleDateString()} ·{" "}
                      {st.itemCount} item{st.itemCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New Stock Take</SheetTitle>
            <SheetDescription>
              Create a new stock take to count your inventory.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Q1 2026 Full Count"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={3}
              />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !createName.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {creating ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}

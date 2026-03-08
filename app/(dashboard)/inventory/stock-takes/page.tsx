"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileText,
  Search,
  BarChart3,
  Plus,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  { label: string; className: string; dot: string }
> = {
  draft: {
    label: "Draft",
    className:
      "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
    dot: "bg-zinc-400",
  },
  in_progress: {
    label: "In Progress",
    className:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  completed: {
    label: "Completed",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  cancelled: {
    label: "Cancelled",
    className:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
    dot: "bg-red-500",
  },
};

export default function StockTakesPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [stockTakes, setStockTakes] = useState<StockTake[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  function fetchStockTakes() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/stock-takes", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        setStockTakes(data.stockTakes || []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchStockTakes();
    const handler = () => fetchStockTakes();
    window.addEventListener("refetch-stock-takes", handler);
    return () => window.removeEventListener("refetch-stock-takes", handler);
  }, []);

  if (loading) return <BrandLoader />;

  const draftCount = stockTakes.filter((s) => s.status === "draft").length;
  const inProgressCount = stockTakes.filter((s) => s.status === "in_progress").length;
  const completedCount = stockTakes.filter((s) => s.status === "completed").length;
  const totalItems = stockTakes.reduce((sum, s) => sum + (s.itemCount || 0), 0);

  const filtered = stockTakes
    .filter((st) => tab === "all" || st.status === tab)
    .filter((st) =>
      !searchQuery || st.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

  // Completion rate
  const completionRate = stockTakes.length > 0
    ? Math.round((completedCount / stockTakes.length) * 100)
    : 0;

  if (stockTakes.length === 0) {
    return (
      <ContentReveal>
        <div className="flex items-start pt-12 pb-12">
          <div className="grid w-full gap-10 lg:grid-cols-2 lg:gap-16 items-center">
            {/* Left: text + CTA */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
                <ClipboardList className="size-3.5 text-emerald-500" />
                Physical Inventory Counts
              </div>
              <h2 className="mt-4 text-lg sm:text-2xl font-semibold tracking-tight">
                Keep your records accurate
              </h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-md">
                Stock takes let you physically count items in your warehouse and
                compare against what the system says. Catch discrepancies before they
                become problems.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <Button
                  onClick={() => openDrawer("stockTake")}
                  size="lg"
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus className="mr-2 size-4" />
                  New Stock Take
                </Button>
              </div>
              {/* Mini stats */}
              <div className="mt-8 flex gap-4 sm:gap-6 text-center">
                {[
                  { label: "Counts", value: "0" },
                  { label: "Items Counted", value: "0" },
                  { label: "Completed", value: "0" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xl font-bold font-mono tabular-nums text-muted-foreground/40">{value}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: visual flow of a stock take lifecycle */}
            <div className="relative hidden lg:block">
              <div className="space-y-3">
                {/* Step 1: Draft */}
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800">
                        <FileText className="size-3.5 text-zinc-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Q1 2026 Full Count</p>
                        <p className="text-[11px] text-muted-foreground font-mono">Draft</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                      Draft
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-muted" />
                    <div className="h-1.5 flex-1 rounded-full bg-muted" />
                    <div className="h-1.5 flex-1 rounded-full bg-muted" />
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex justify-center">
                  <ArrowRight className="size-4 text-muted-foreground/30 rotate-90" />
                </div>

                {/* Step 2: In progress */}
                <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                        <Clock className="size-3.5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Counting items...</p>
                        <p className="text-[11px] text-muted-foreground">12 of 48 items counted</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400">
                      In Progress
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-blue-500" />
                    <div className="h-1.5 flex-[3] rounded-full bg-muted" />
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex justify-center">
                  <ArrowRight className="size-4 text-muted-foreground/30 rotate-90" />
                </div>

                {/* Step 3: Completed */}
                <div className="rounded-xl border border-dashed border-emerald-200 dark:border-emerald-900/40 bg-card/60 p-4 opacity-60">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-950/40">
                        <CheckCircle2 className="size-3.5 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Count complete</p>
                        <p className="text-[11px] text-muted-foreground">3 discrepancies found</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                      Completed
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-emerald-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      <PageHeader
        title="Stock Takes"
        description="Plan, conduct, and review physical inventory counts to keep your records accurate."
      >
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search stock takes..."
            className="pl-9 h-9 text-sm"
          />
        </div>
      </PageHeader>

      {/* Stats + distribution */}
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        {/* Left: key numbers */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-xl border bg-card p-5 flex flex-col justify-between gap-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ClipboardList className="size-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Overview</span>
            </div>
            <span className="text-[11px] text-muted-foreground font-medium">{completionRate}% completed</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-bold font-mono tabular-nums">{stockTakes.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total counts</p>
            </div>
            <div>
              <p className="text-3xl font-bold font-mono tabular-nums">{totalItems}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Items counted</p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex h-2 rounded-full overflow-hidden bg-muted">
              {completedCount > 0 && (
                <div
                  className="bg-emerald-500 transition-all duration-500"
                  style={{ width: `${(completedCount / stockTakes.length) * 100}%` }}
                />
              )}
              {inProgressCount > 0 && (
                <div
                  className="bg-blue-500 transition-all duration-500"
                  style={{ width: `${(inProgressCount / stockTakes.length) * 100}%` }}
                />
              )}
              {draftCount > 0 && (
                <div
                  className="bg-zinc-300 dark:bg-zinc-600 transition-all duration-500"
                  style={{ width: `${(draftCount / stockTakes.length) * 100}%` }}
                />
              )}
            </div>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" />Completed ({completedCount})</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-blue-500" />In Progress ({inProgressCount})</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />Draft ({draftCount})</span>
            </div>
          </div>
        </motion.div>

        {/* Right: status breakdown cards */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Draft", value: draftCount, icon: FileText, color: "text-zinc-500", bg: "bg-zinc-100 dark:bg-zinc-800" },
            { label: "In Progress", value: inProgressCount, icon: Clock, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/40" },
            { label: "Completed", value: completedCount, icon: ClipboardCheck, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
            { label: "Avg Items", value: stockTakes.length > 0 ? Math.round(totalItems / stockTakes.length) : 0, icon: BarChart3, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/40" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 + i * 0.04 }}
              className="rounded-xl border bg-card p-4 flex flex-col justify-between"
            >
              <div className={cn("flex size-8 items-center justify-center rounded-lg", stat.bg)}>
                <stat.icon className={cn("size-4", stat.color)} />
              </div>
              <div className="mt-3">
                <p className={cn("text-2xl font-bold font-mono tabular-nums", stat.color)}>
                  {stat.value}
                </p>
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mt-0.5">
                  {stat.label}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
        <TabsList>
          <TabsTrigger value="all">All ({stockTakes.length})</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* List */}
      {filtered.length === 0 ? (
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
    </ContentReveal>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
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
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn } from "@/lib/utils";

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

  const filtered =
    tab === "all"
      ? stockTakes
      : stockTakes.filter((st) => st.status === tab);

  if (stockTakes.length === 0) {
    return (
      <ContentReveal>
        <EmptyState
          icon={ClipboardList}
          title="No stock takes yet"
          description="Create your first stock take to start counting inventory."
        >
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-1.5 size-3.5" />
            New Stock Take
          </Button>
        </EmptyState>

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

  return (
    <ContentReveal className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">Stock Takes</h1>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="mr-1.5 size-3.5" />
          New Stock Take
        </Button>
      </div>

      {/* Filter tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
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
            No stock takes found
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card divide-y">
          {filtered.map((st) => {
            const statusCfg = STATUS_CONFIG[st.status];
            return (
              <div
                key={st.id}
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
              </div>
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

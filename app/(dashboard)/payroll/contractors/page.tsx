"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import { Briefcase, DollarSign, FileText, Plus, Search, Users, Loader2, X } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Badge } from "@/components/ui/badge";
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
import { formatMoney } from "@/lib/money";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@/lib/utils";

interface Contractor {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
  hourlyRate: number | null;
  currency: string;
  isActive: boolean;
  createdAt?: string;
}

type StatusFilter = "all" | "active" | "inactive";

const PAGE_SIZE = 50;

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

function sortContractors(list: Contractor[], sortBy: string, sortOrder: "asc" | "desc"): Contractor[] {
  const dir = sortOrder === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return dir * a.name.localeCompare(b.name);
      case "rate":
        return dir * ((a.hourlyRate ?? 0) - (b.hourlyRate ?? 0));
      case "created":
      default:
        return dir * ((a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    }
  });
}

export default function ContractorsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();

  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [fetchKey, setFetchKey] = useState(0);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortValue, setSortValue] = useState("created:desc");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const pendingSearch = search !== debouncedSearch;

  const [searchKey, setSearchKey] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const [sortBy, sortOrder] = useMemo(() => {
    const [key, order] = sortValue.split(":");
    return [key, order as "asc" | "desc"] as const;
  }, [sortValue]);

  const hasMore = contractors.length < totalCount;

  const buildParams = useCallback((p: number) => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("isActive", statusFilter === "active" ? "true" : "false");
    params.set("page", String(p));
    params.set("limit", String(PAGE_SIZE));
    return params;
  }, [statusFilter]);

  // Fetch first page when filter changes
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRefetching(true);
    setPage(1);

    fetch(`/api/v1/payroll/contractors?${buildParams(1)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setContractors(data.data || []);
        setTotalCount(data.pagination?.total || 0);
      })
      .finally(() => {
        if (!cancelled) {
          setInitialLoad(false);
          setRefetching(false);
          setFetchKey((k) => k + 1);
        }
      });

    return () => { cancelled = true; };
  }, [orgId, buildParams]);

  // Load more
  const loadMore = useCallback(() => {
    if (!orgId || loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);

    fetch(`/api/v1/payroll/contractors?${buildParams(nextPage)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setContractors((prev) => [...prev, ...data.data]);
          setPage(nextPage);
        }
      })
      .finally(() => setLoadingMore(false));
  }, [orgId, page, buildParams, loadingMore]);

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !refetching) loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, refetching]);

  // Client-side search filtering
  const filteredContractors = useMemo(() => {
    let list = contractors;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.company ?? "").toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q)
      );
    }
    return sortContractors(list, sortBy, sortOrder);
  }, [contractors, debouncedSearch, sortBy, sortOrder]);

  // Bump searchKey when debounced search changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchKey((k) => k + 1);
  }, [debouncedSearch]);

  if (initialLoad) return <BrandLoader />;

  const activeCount = contractors.filter((c) => c.isActive).length;
  const inactiveCount = contractors.filter((c) => !c.isActive).length;

  // Empty state: no contractors at all and no filters applied
  if (!refetching && contractors.length === 0 && statusFilter === "all" && !search) {
    return (
      <ContentReveal className="space-y-6">
        {/* Actions */}
        <div className="flex justify-end">
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => openDrawer("contractor")}
          >
            <Plus className="size-3" /> Add Contractor
          </Button>
        </div>

        {/* Main hero empty state */}
        <motion.div
          {...anim(0.2)}
          className="relative overflow-hidden rounded-2xl border-2 border-dashed"
        >
          <div className="relative flex flex-col items-center justify-center py-20 px-6 text-center">
            {/* Animated icons */}
            <div className="relative mb-6">
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex size-16 items-center justify-center rounded-2xl bg-muted ring-4 ring-muted/50"
              >
                <Briefcase className="size-8 text-foreground" />
              </motion.div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 0.5 }}
                className="absolute -top-2 -right-3 flex size-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/60 ring-2 ring-blue-100/50 dark:ring-blue-900/30"
              >
                <DollarSign className="size-4 text-blue-600 dark:text-blue-400" />
              </motion.div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 0.6 }}
                className="absolute -bottom-1 -left-3 flex size-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/60 ring-2 ring-amber-100/50 dark:ring-amber-900/30"
              >
                <FileText className="size-3.5 text-amber-600 dark:text-amber-400" />
              </motion.div>
            </div>

            <motion.h3
              {...anim(0.4)}
              className="text-lg font-semibold"
            >
              No contractors yet
            </motion.h3>
            <motion.p
              {...anim(0.45)}
              className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed"
            >
              Add contractors to manage payments and track costs for external workers.
            </motion.p>

            <motion.div {...anim(0.55)} className="mt-8">
              <Button
                onClick={() => openDrawer("contractor")}
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
              >
                <Plus className="mr-2 size-4" />
                Add Your First Contractor
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Ghost rows */}
        <motion.div {...anim(0.6)} className="space-y-3">
          <div className="rounded-xl border border-dashed border-muted-foreground/15 divide-y divide-dashed divide-muted-foreground/10">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5" style={{ opacity: 1 - i * 0.25 }}>
                <div className="size-9 rounded-lg bg-muted/40" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-36 rounded bg-muted/40" />
                  <div className="h-3 w-16 rounded bg-muted/30" />
                </div>
                <div className="hidden sm:block h-3.5 w-20 rounded bg-muted/30" />
              </div>
            ))}
          </div>
        </motion.div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      {/* Actions */}
      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => openDrawer("contractor")}
        >
          <Plus className="size-3" /> Add Contractor
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Active Contractors</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate text-emerald-600 dark:text-emerald-400">
            {activeCount}
          </p>
        </motion.div>

        <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Inactive</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
            {inactiveCount}
          </p>
        </motion.div>

        <motion.div {...anim(0.1)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Briefcase className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Total Contractors</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
            {totalCount}
          </p>
        </motion.div>
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
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search contractors..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-8 h-8 text-sm" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={sortValue} onValueChange={setSortValue}>
            <SelectTrigger className="h-8 w-full sm:w-[160px] text-xs">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created:desc">Newest first</SelectItem>
              <SelectItem value="created:asc">Oldest first</SelectItem>
              <SelectItem value="name:asc">Name (A-Z)</SelectItem>
              <SelectItem value="name:desc">Name (Z-A)</SelectItem>
              <SelectItem value="rate:desc">Highest rate</SelectItem>
              <SelectItem value="rate:asc">Lowest rate</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {refetching || pendingSearch ? (
        <BrandLoader className="h-48" />
      ) : filteredContractors.length === 0 ? (
        <ContentReveal key={`${fetchKey}-${searchKey}`}>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <Briefcase className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No contractors found</p>
            <p className="text-xs text-muted-foreground mt-1">{search ? "Try a different search" : "No contractors match this filter"}</p>
          </div>
        </ContentReveal>
      ) : (
        <ContentReveal key={`${fetchKey}-${searchKey}`}>
          <MotionConfig reducedMotion="never">
            <motion.div
              initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
              style={{ willChange: "opacity, transform, filter" }}
            >
              <div className="rounded-xl border bg-card divide-y">
                {filteredContractors.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/payroll/contractors/${c.id}`)}
                    className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Briefcase className="size-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.company || c.email || "-"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {c.hourlyRate && <span className="text-sm font-mono tabular-nums">{formatMoney(c.hourlyRate)}/hr</span>}
                      <Badge variant="outline" className={cn("text-[11px]", c.isActive ? "text-emerald-600" : "text-muted-foreground")}>
                        {c.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </MotionConfig>
        </ContentReveal>
      )}

      {/* Infinite scroll sentinel & count */}
      {!refetching && !pendingSearch && filteredContractors.length > 0 && (
        <>
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              Showing {contractors.length} of {totalCount} contractor{totalCount !== 1 ? "s" : ""}
            </p>
          </div>
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loadingMore && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </div>
          )}
        </>
      )}
    </ContentReveal>
  );
}

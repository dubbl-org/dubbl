"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import { Briefcase, DollarSign, FileText, Plus, Search, Users, ArrowUpDown, X } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { PageHeader } from "@/components/dashboard/page-header";
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
}

type StatusFilter = "all" | "active" | "inactive";
type SortKey = "name" | "company" | "rate";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "company", label: "Company" },
  { value: "rate", label: "Rate" },
];

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

export default function ContractorsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const pendingSearch = search !== debouncedSearch;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [fetchKey, setFetchKey] = useState(0);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchData = useCallback(() => {
    if (!orgId) return;
    fetch("/api/v1/payroll/contractors", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => { if (data.data) setContractors(data.data); })
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Re-animate on filter changes */
  useEffect(() => {
    if (!loading) setFetchKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sortBy, sortOrder, debouncedSearch]);

  const filtered = contractors
    .filter((c) => {
      if (statusFilter === "active" && !c.isActive) return false;
      if (statusFilter === "inactive" && c.isActive) return false;
      if (!debouncedSearch) return true;
      const q = debouncedSearch.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const dir = sortOrder === "asc" ? 1 : -1;
      switch (sortBy) {
        case "company": return dir * (a.company ?? "").localeCompare(b.company ?? "");
        case "rate": return dir * ((a.hourlyRate ?? 0) - (b.hourlyRate ?? 0));
        case "name": default: return dir * a.name.localeCompare(b.name);
      }
    });

  if (loading) return <BrandLoader />;

  const activeCount = contractors.filter((c) => c.isActive).length;
  const inactiveCount = contractors.filter((c) => !c.isActive).length;
  const hasContractors = contractors.length > 0;

  if (!hasContractors) {
    return (
      <ContentReveal className="space-y-6">
        <PageHeader title="Contractors" description="Manage contractors and their payments.">
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => openDrawer("contractor")}
          >
            <Plus className="size-3" /> Add Contractor
          </Button>
        </PageHeader>

        {/* Main hero empty state */}
        <motion.div
          {...anim(0.2)}
          className="relative overflow-hidden rounded-2xl border border-dashed border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-b from-emerald-50/50 to-transparent dark:from-emerald-950/20 dark:to-transparent"
        >
          {/* Background pattern */}
          <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23059669' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />

          <div className="relative flex flex-col items-center justify-center py-20 px-6 text-center">
            {/* Animated icons */}
            <div className="relative mb-6">
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex size-16 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 ring-4 ring-emerald-100/50 dark:ring-emerald-900/30"
              >
                <Briefcase className="size-8 text-emerald-600 dark:text-emerald-400" />
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
      <PageHeader title="Contractors" description="Manage contractors and their payments.">
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => openDrawer("contractor")}
        >
          <Plus className="size-3" /> Add Contractor
        </Button>
      </PageHeader>

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
            {contractors.length}
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

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-8 w-full sm:w-[130px] text-xs">
              <ArrowUpDown className="size-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => setSortOrder((p) => (p === "asc" ? "desc" : "asc"))}>
            <ArrowUpDown className={cn("size-3.5 transition-transform", sortOrder === "asc" && "rotate-180")} />
          </Button>
        </div>
      </div>

      {/* List */}
      {pendingSearch ? (
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
              <Briefcase className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No contractors found</p>
            <p className="text-xs text-muted-foreground mt-1">{search ? "Try a different search" : "No contractors match this filter"}</p>
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
            <div className="rounded-xl border bg-card divide-y">
              {filtered.map((c) => (
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
      )}
    </ContentReveal>
  );
}

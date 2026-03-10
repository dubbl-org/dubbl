"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import { toast } from "sonner";
import {
  DollarSign,
  Plus,
  BarChart3,
  TrendingUp,
  Users,
  Layers,
  ClipboardList,
  Search,
  ArrowUpDown,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTopbarAction } from "@/components/dashboard/topbar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  SheetDescription,
} from "@/components/ui/sheet";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Band {
  id: string;
  name: string;
  level: string | null;
  minSalary: number;
  midSalary: number;
  maxSalary: number;
}

interface Review {
  id: string;
  name: string;
  effectiveDate: string;
  status: string;
  totalBudget: number | null;
  _count?: { entries: number };
}

const statusColors: Record<string, string> = {
  draft: "",
  in_progress: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

type ReviewFilter = "all" | "draft" | "in_progress" | "completed" | "cancelled";

const BAND_SORT_OPTIONS = [
  { value: "name:asc", label: "Name (A-Z)" },
  { value: "name:desc", label: "Name (Z-A)" },
  { value: "min:asc", label: "Min salary" },
  { value: "max:desc", label: "Max salary" },
] as const;

const REVIEW_SORT_OPTIONS = [
  { value: "date:desc", label: "Newest first" },
  { value: "date:asc", label: "Oldest first" },
  { value: "name:asc", label: "Name (A-Z)" },
  { value: "budget:desc", label: "Budget (high)" },
  { value: "budget:asc", label: "Budget (low)" },
] as const;

export default function CompensationPage() {
  const router = useRouter();
  const [bands, setBands] = useState<Band[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  /* Search / filter / sort */
  const [bandSearch, setBandSearch] = useState("");
  const debouncedBandSearch = useDebounce(bandSearch);
  const pendingBandSearch = bandSearch !== debouncedBandSearch;
  const [bandSort, setBandSort] = useState("name:asc");
  const [bandFetchKey, setBandFetchKey] = useState(0);

  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [reviewSearch, setReviewSearch] = useState("");
  const debouncedReviewSearch = useDebounce(reviewSearch);
  const pendingReviewSearch = reviewSearch !== debouncedReviewSearch;
  const [reviewSort, setReviewSort] = useState("date:desc");
  const [reviewFetchKey, setReviewFetchKey] = useState(0);

  const [bandSheet, setBandSheet] = useState(false);
  const [bandSaving, setBandSaving] = useState(false);
  const [newBand, setNewBand] = useState({ name: "", level: "", minSalary: "", midSalary: "", maxSalary: "" });

  const [reviewSheet, setReviewSheet] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [newReview, setNewReview] = useState({ name: "", effectiveDate: "", totalBudget: "" });

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchData = useCallback(() => {
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };
    Promise.all([
      fetch("/api/v1/payroll/compensation/bands", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/compensation/reviews", { headers }).then((r) => r.json()),
    ])
      .then(([bandsData, reviewsData]) => {
        if (bandsData.data) setBands(bandsData.data);
        if (reviewsData.data) setReviews(reviewsData.data);
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Re-animate on filter changes */
  useEffect(() => {
    if (!loading) setBandFetchKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandSort, debouncedBandSearch]);

  useEffect(() => {
    if (!loading) setReviewFetchKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewFilter, reviewSort, debouncedReviewSearch]);

  /* Filtered + sorted */
  const filteredBands = useMemo(() => {
    const [sortBy, sortOrder] = bandSort.split(":") as [string, string];
    const dir = sortOrder === "asc" ? 1 : -1;

    return bands
      .filter((b) => {
        if (!debouncedBandSearch) return true;
        const q = debouncedBandSearch.toLowerCase();
        return b.name.toLowerCase().includes(q) || b.level?.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "min": return dir * (a.minSalary - b.minSalary);
          case "max": return dir * (a.maxSalary - b.maxSalary);
          case "name": default: return dir * a.name.localeCompare(b.name);
        }
      });
  }, [bands, debouncedBandSearch, bandSort]);

  const filteredReviews = useMemo(() => {
    const [sortBy, sortOrder] = reviewSort.split(":") as [string, string];
    const dir = sortOrder === "asc" ? 1 : -1;

    return reviews
      .filter((r) => {
        if (reviewFilter !== "all" && r.status !== reviewFilter) return false;
        if (!debouncedReviewSearch) return true;
        const q = debouncedReviewSearch.toLowerCase();
        return r.name.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "name": return dir * a.name.localeCompare(b.name);
          case "budget": return dir * ((a.totalBudget ?? 0) - (b.totalBudget ?? 0));
          case "date": default: return dir * a.effectiveDate.localeCompare(b.effectiveDate);
        }
      });
  }, [reviews, reviewFilter, debouncedReviewSearch, reviewSort]);

  async function handleAddBand(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId || !newBand.name) return;
    setBandSaving(true);
    try {
      const res = await fetch("/api/v1/payroll/compensation/bands", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: newBand.name,
          level: newBand.level || undefined,
          minSalary: Math.round(parseFloat(newBand.minSalary || "0") * 100),
          midSalary: Math.round(parseFloat(newBand.midSalary || "0") * 100),
          maxSalary: Math.round(parseFloat(newBand.maxSalary || "0") * 100),
        }),
      });
      if (res.ok) {
        toast.success("Band added");
        setBandSheet(false);
        setNewBand({ name: "", level: "", minSalary: "", midSalary: "", maxSalary: "" });
        fetchData();
      }
    } catch {
      toast.error("Failed to create band");
    } finally {
      setBandSaving(false);
    }
  }

  async function handleAddReview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId || !newReview.name) return;
    setReviewSaving(true);
    try {
      const res = await fetch("/api/v1/payroll/compensation/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: newReview.name,
          effectiveDate: newReview.effectiveDate,
          totalBudget: newReview.totalBudget ? Math.round(parseFloat(newReview.totalBudget) * 100) : undefined,
        }),
      });
      if (res.ok) {
        toast.success("Review created");
        setReviewSheet(false);
        setNewReview({ name: "", effectiveDate: "", totalBudget: "" });
        fetchData();
      }
    } catch {
      toast.error("Failed to create review");
    } finally {
      setReviewSaving(false);
    }
  }

  useTopbarAction(
    useMemo(
      (): ReactNode => (
        <>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setBandSheet(true)}>
            <Plus className="size-3" /> Add Band
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setReviewSheet(true)}>
            <Plus className="size-3" /> New Review
          </Button>
        </>
      ),
      []
    )
  );

  if (loading) return <BrandLoader />;

  const hasData = bands.length > 0 || reviews.length > 0;
  const activeReviews = reviews.filter((r) => r.status === "in_progress" || r.status === "draft");
  const avgBandWidth = bands.length > 0
    ? bands.reduce((sum, b) => sum + (b.maxSalary - b.minSalary), 0) / bands.length
    : 0;
  const totalEntries = reviews.reduce((sum, r) => sum + (r._count?.entries ?? 0), 0);

  if (!hasData) {
    return (
      <ContentReveal className="space-y-6">

        {/* Ghost stat cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Layers, label: "Total Bands" },
            { icon: ClipboardList, label: "Active Reviews" },
            { icon: TrendingUp, label: "Avg Band Width" },
            { icon: BarChart3, label: "Total Entries" },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              {...anim(i * 0.05)}
              className="rounded-xl border border-dashed border-muted-foreground/20 bg-card p-4"
            >
              <div className="flex items-center gap-2 text-muted-foreground/40">
                <card.icon className="size-4" />
                <span className="text-[11px] font-medium uppercase tracking-wide">{card.label}</span>
              </div>
              <div className="mt-3 h-7 w-20 rounded-md bg-muted/50" />
            </motion.div>
          ))}
        </div>

        {/* Main hero empty state */}
        <motion.div
          {...anim(0.2)}
          className="relative overflow-hidden rounded-2xl border-2 border-dashed"
        >
          <div className="relative flex flex-col items-center justify-center py-20 px-6 text-center">
            {/* Animated icon cluster */}
            <div className="relative mb-6">
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex size-16 items-center justify-center rounded-2xl bg-muted ring-4 ring-muted/50"
              >
                <DollarSign className="size-8 text-foreground" />
              </motion.div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 0.5 }}
                className="absolute -top-2 -right-3 flex size-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/60 ring-2 ring-blue-100/50 dark:ring-blue-900/30"
              >
                <TrendingUp className="size-4 text-blue-600 dark:text-blue-400" />
              </motion.div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 0.6 }}
                className="absolute -bottom-1 -left-3 flex size-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/60 ring-2 ring-amber-100/50 dark:ring-amber-900/30"
              >
                <Users className="size-3.5 text-amber-600 dark:text-amber-400" />
              </motion.div>
            </div>

            <motion.h3 {...anim(0.4)} className="text-lg font-semibold">
              Compensation Management
            </motion.h3>
            <motion.p {...anim(0.45)} className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
              Define salary bands, run compensation reviews, and ensure pay equity across your organization.
            </motion.p>

            <motion.div {...anim(0.55)} className="mt-8 flex items-center gap-3">
              <Button
                onClick={() => setBandSheet(true)}
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
              >
                <Plus className="mr-2 size-4" />
                Add First Band
              </Button>
              <Button
                onClick={() => setReviewSheet(true)}
                size="lg"
                variant="outline"
              >
                <ClipboardList className="mr-2 size-4" />
                Start a Review
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Ghost cards below */}
        <motion.div {...anim(0.6)} className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground/50">Compensation Bands</h3>
          <div className="rounded-xl border border-dashed border-muted-foreground/15 divide-y divide-dashed divide-muted-foreground/10">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5" style={{ opacity: 1 - i * 0.25 }}>
                <div className="size-9 rounded-lg bg-muted/40" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-36 rounded bg-muted/40" />
                  <div className="h-3 w-24 rounded bg-muted/30" />
                </div>
                <div className="hidden sm:block h-3.5 w-20 rounded bg-muted/30" />
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div {...anim(0.65)} className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground/50">Reviews</h3>
          <div className="rounded-xl border border-dashed border-muted-foreground/15 divide-y divide-dashed divide-muted-foreground/10">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5" style={{ opacity: 1 - i * 0.3 }}>
                <div className="size-9 rounded-lg bg-muted/40" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-40 rounded bg-muted/40" />
                  <div className="h-3 w-20 rounded bg-muted/30" />
                </div>
                <div className="hidden sm:block h-5 w-16 rounded-full bg-muted/30" />
              </div>
            ))}
          </div>
        </motion.div>

        {/* Sheets */}
        <BandSheet open={bandSheet} onOpenChange={setBandSheet} saving={bandSaving} newBand={newBand} setNewBand={setNewBand} onSubmit={handleAddBand} />
        <ReviewSheet open={reviewSheet} onOpenChange={setReviewSheet} saving={reviewSaving} newReview={newReview} setNewReview={setNewReview} onSubmit={handleAddReview} />
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={() => setBandSheet(true)}>
          <Plus className="mr-1.5 size-3.5" /> Add Band
        </Button>
        <Button size="sm" variant="outline" onClick={() => setReviewSheet(true)}>
          <Plus className="mr-1.5 size-3.5" /> New Review
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Layers className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Total Bands</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
            {bands.length}
          </p>
        </motion.div>

        <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ClipboardList className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Active Reviews</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
            {activeReviews.length}
          </p>
        </motion.div>

        <motion.div {...anim(0.1)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Avg Band Width</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
            {formatMoney(Math.round(avgBandWidth))}
          </p>
        </motion.div>

        <motion.div {...anim(0.15)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BarChart3 className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Total Entries</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
            {totalEntries}
          </p>
        </motion.div>
      </div>

      {/* Bands */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Compensation Bands</h3>
          <span className="text-xs text-muted-foreground">{filteredBands.length} bands</span>
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search bands..."
              value={bandSearch}
              onChange={(e) => setBandSearch(e.target.value)}
              className="pl-9 pr-8 h-8 text-sm"
            />
            {bandSearch && (
              <button onClick={() => setBandSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={bandSort} onValueChange={setBandSort}>
            <SelectTrigger className="h-8 w-full sm:w-[150px] text-xs">
              <ArrowUpDown className="size-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BAND_SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {pendingBandSearch ? (
          <BrandLoader className="h-48" />
        ) : filteredBands.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <DollarSign className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">{bandSearch ? "No bands match your search" : "No compensation bands"}</p>
            <p className="text-xs text-muted-foreground mt-1">{bandSearch ? "Try a different search" : "Define salary ranges for each role level"}</p>
          </div>
        ) : (
          <ContentReveal key={`bands-${bandFetchKey}-${debouncedBandSearch}`}>
            <div className="rounded-xl border bg-card divide-y">
              {filteredBands.map((b) => (
                <div key={b.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.level ? `${b.level} · ` : ""}{formatMoney(b.minSalary)} - {formatMoney(b.maxSalary)}
                    </p>
                  </div>
                  <p className="text-sm font-mono tabular-nums text-muted-foreground">Mid: {formatMoney(b.midSalary)}</p>
                </div>
              ))}
            </div>
          </ContentReveal>
        )}
      </div>

      {/* Reviews */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Compensation Reviews</h3>
          <span className="text-xs text-muted-foreground">{filteredReviews.length} reviews</span>
        </div>

        {/* Filter + Search + Sort */}
        <div className="space-y-2">
          <Tabs value={reviewFilter} onValueChange={(v) => setReviewFilter(v as ReviewFilter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="in_progress">In Progress</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search reviews..."
                value={reviewSearch}
                onChange={(e) => setReviewSearch(e.target.value)}
                className="pl-9 pr-8 h-8 text-sm"
              />
              {reviewSearch && (
                <button onClick={() => setReviewSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <Select value={reviewSort} onValueChange={setReviewSort}>
              <SelectTrigger className="h-8 w-full sm:w-[150px] text-xs">
                <ArrowUpDown className="size-3 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVIEW_SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {pendingReviewSearch ? (
          <BrandLoader className="h-48" />
        ) : filteredReviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <BarChart3 className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">{reviewSearch || reviewFilter !== "all" ? "No reviews match" : "No reviews yet"}</p>
            <p className="text-xs text-muted-foreground mt-1">{reviewSearch ? "Try a different search" : "Start a compensation review"}</p>
          </div>
        ) : (
          <ContentReveal key={`reviews-${reviewFetchKey}-${debouncedReviewSearch}`}>
            <div className="rounded-xl border bg-card divide-y">
              {filteredReviews.map((r) => (
                <button
                  key={r.id}
                  onClick={() => router.push(`/payroll/compensation/reviews/${r.id}`)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                >
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">Effective: {r.effectiveDate}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.totalBudget && <span className="text-sm font-mono tabular-nums">{formatMoney(r.totalBudget)}</span>}
                    <Badge variant="outline" className={cn("text-[10px]", statusColors[r.status] || "")}>
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </ContentReveal>
        )}
      </div>

      {/* Sheets */}
      <BandSheet open={bandSheet} onOpenChange={setBandSheet} saving={bandSaving} newBand={newBand} setNewBand={setNewBand} onSubmit={handleAddBand} />
      <ReviewSheet open={reviewSheet} onOpenChange={setReviewSheet} saving={reviewSaving} newReview={newReview} setNewReview={setNewReview} onSubmit={handleAddReview} />
    </ContentReveal>
  );
}

// ---------------------------------------------------------------------------
// Band Sheet Drawer
// ---------------------------------------------------------------------------
function BandSheet({
  open,
  onOpenChange,
  saving,
  newBand,
  setNewBand,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  saving: boolean;
  newBand: { name: string; level: string; minSalary: string; midSalary: string; maxSalary: string };
  setNewBand: (v: { name: string; level: string; minSalary: string; midSalary: string; maxSalary: string }) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <DollarSign className="size-5" />
            </div>
            <div>
              <SheetTitle className="text-lg">Add Compensation Band</SheetTitle>
              <SheetDescription>Define a salary range for a role level.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input name="name" value={newBand.name} onChange={(e) => setNewBand({ ...newBand, name: e.target.value })} placeholder="e.g. Software Engineer" />
              </div>
              <div className="space-y-2">
                <Label>Level</Label>
                <Input name="level" value={newBand.level} onChange={(e) => setNewBand({ ...newBand, level: e.target.value })} placeholder="e.g. L3, Senior" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Min Salary ($)</Label>
                  <Input type="number" value={newBand.minSalary} onChange={(e) => setNewBand({ ...newBand, minSalary: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Mid Salary ($)</Label>
                  <Input type="number" value={newBand.midSalary} onChange={(e) => setNewBand({ ...newBand, midSalary: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Max Salary ($)</Label>
                  <Input type="number" value={newBand.maxSalary} onChange={(e) => setNewBand({ ...newBand, maxSalary: e.target.value })} />
                </div>
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-4 py-3 sm:px-6 sm:py-4 backdrop-blur-sm">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Adding..." : "Add Band"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Review Sheet Drawer
// ---------------------------------------------------------------------------
function ReviewSheet({
  open,
  onOpenChange,
  saving,
  newReview,
  setNewReview,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  saving: boolean;
  newReview: { name: string; effectiveDate: string; totalBudget: string };
  setNewReview: (v: { name: string; effectiveDate: string; totalBudget: string }) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <ClipboardList className="size-5" />
            </div>
            <div>
              <SheetTitle className="text-lg">New Compensation Review</SheetTitle>
              <SheetDescription>Create a review cycle to evaluate compensation.</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input name="name" value={newReview.name} onChange={(e) => setNewReview({ ...newReview, name: e.target.value })} placeholder="e.g. Q1 2026 Review" />
              </div>
              <div className="space-y-2">
                <Label>Effective Date</Label>
                <Input type="date" name="effectiveDate" value={newReview.effectiveDate} onChange={(e) => setNewReview({ ...newReview, effectiveDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Budget ($)</Label>
                <Input type="number" name="totalBudget" value={newReview.totalBudget} onChange={(e) => setNewReview({ ...newReview, totalBudget: e.target.value })} placeholder="Optional" />
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-4 py-3 sm:px-6 sm:py-4 backdrop-blur-sm">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Creating..." : "Create Review"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

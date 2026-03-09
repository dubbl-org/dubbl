"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import {
  Users,
  Plus,
  Search,
  ArrowUpDown,
  X,
  FolderKanban,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@/lib/utils";

interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  members?: { id: string }[];
  _count?: { members: number };
  memberCount?: number;
}

type SortKey = "name";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name" },
];

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

function getMemberCount(team: Team): number {
  if (typeof team.memberCount === "number") return team.memberCount;
  if (team._count?.members != null) return team._count.members;
  if (team.members) return team.members.length;
  return 0;
}

export default function TeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);

  // Search, sort
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const pendingSearch = search !== debouncedSearch;
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const fetchTeams = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/teams", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        setTeams(data.data || []);
      })
      .finally(() => {
        setLoading(false);
        setFetchKey((k) => k + 1);
      });
  }, []);

  useEffect(() => {
    fetchTeams();
    const handler = () => fetchTeams();
    window.addEventListener("refetch-teams", handler);
    return () => window.removeEventListener("refetch-teams", handler);
  }, [fetchTeams]);

  // Re-animate on sort/search changes
  useEffect(() => {
    if (!loading) setFetchKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortOrder, debouncedSearch]);

  // Client-side filtering + sorting
  const filtered = teams
    .filter((t) => {
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const nameMatch = t.name.toLowerCase().includes(q);
        const descMatch = t.description?.toLowerCase().includes(q);
        if (!nameMatch && !descMatch) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dir = sortOrder === "asc" ? 1 : -1;
      return dir * a.name.localeCompare(b.name);
    });

  const totalMembers = teams.reduce((sum, t) => sum + getMemberCount(t), 0);

  function toggleSortOrder() {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  if (loading) return <BrandLoader />;

  if (teams.length === 0) {
    return (
      <ContentReveal className="space-y-6">
        <PageHeader
          title="Teams"
          description="Organize members into teams."
        />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
            <FolderKanban className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No teams yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create your first team to organize your members.
          </p>
          <Button
            className="mt-4 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => router.push("/teams")}
          >
            <Plus className="mr-2 size-4" />
            New Team
          </Button>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      <PageHeader
        title="Teams"
        description="Organize members into teams."
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FolderKanban className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Total Teams</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
            {teams.length}
          </p>
        </motion.div>

        <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Total Members</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
            {totalMembers}
          </p>
        </motion.div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search teams..."
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

          <div className="flex items-center gap-2">
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
      </div>

      {/* Team cards grid */}
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
              <FolderKanban className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No teams found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Try a different search term" : "No teams match this filter"}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((team) => (
                <button
                  key={team.id}
                  onClick={() => router.push(`/teams/${team.id}`)}
                  className="rounded-xl border bg-card p-4 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: team.color || "#6b7280" }}
                    />
                    <p className="text-sm font-medium truncate">{team.name}</p>
                  </div>
                  {team.description && (
                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                      {team.description}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[11px] border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
                    >
                      <Users className="size-3 mr-1" />
                      {getMemberCount(team)} {getMemberCount(team) === 1 ? "member" : "members"}
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

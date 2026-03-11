"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import {
  Users,
  Plus,
  Search,
  ArrowUpDown,
  X,
  FolderKanban,
  Target,
  BarChart3,
  Crown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTopbarAction } from "@/components/dashboard/topbar";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@/lib/utils";

interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  members?: { id: string; name?: string }[];
  _count?: { members: number };
  memberCount?: number;
}

type SortKey = "name" | "members";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "members", label: "Members" },
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

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const ACCENT_COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

function getTeamColor(team: Team, index: number): string {
  return team.color || ACCENT_COLORS[index % ACCENT_COLORS.length];
}

function CreateTeamSheet({
  open,
  setOpen,
  name,
  setName,
  desc,
  setDesc,
  color,
  setColor,
  saving,
  onSave,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  name: string;
  setName: (v: string) => void;
  desc: string;
  setDesc: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New Team</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering, Marketing"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`size-7 rounded-full transition-all ${
                    color === c ? "ring-2 ring-offset-2 ring-primary" : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={onSave}
            disabled={saving || !name.trim()}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? "Creating..." : "Create Team"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
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
      if (sortBy === "members") {
        return dir * (getMemberCount(a) - getMemberCount(b));
      }
      return dir * a.name.localeCompare(b.name);
    });

  // Create team sheet
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createColor, setCreateColor] = useState("#3b82f6");
  const [createSaving, setCreateSaving] = useState(false);

  async function handleCreateTeam() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !createName.trim()) return;
    setCreateSaving(true);
    try {
      const res = await fetch("/api/v1/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim() || null,
          color: createColor,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      toast.success("Team created");
      setCreateOpen(false);
      setCreateName("");
      setCreateDesc("");
      setCreateColor("#3b82f6");
      fetchTeams();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setCreateSaving(false);
    }
  }

  const totalMembers = teams.reduce((sum, t) => sum + getMemberCount(t), 0);
  const avgTeamSize = teams.length > 0 ? Math.round((totalMembers / teams.length) * 10) / 10 : 0;
  const largestTeam = teams.length > 0
    ? teams.reduce((max, t) => (getMemberCount(t) > getMemberCount(max) ? t : max), teams[0])
    : null;

  function toggleSortOrder() {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  const openCreateSheet = useCallback(() => setCreateOpen(true), []);

  useTopbarAction(
    useMemo(
      () => (
        <Button
          onClick={openCreateSheet}
          size="sm"
          className="h-7 text-xs gap-1"
        >
          <Plus className="size-3" /> New Team
        </Button>
      ),
      [openCreateSheet]
    )
  );

  if (loading) return <BrandLoader />;

  /* ── Empty state ── */
  if (teams.length === 0) {
    return (
      <ContentReveal className="space-y-6">
        {/* Ghost stat cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: FolderKanban, label: "Total Teams" },
            { icon: Users, label: "Total Members" },
            { icon: BarChart3, label: "Avg Team Size" },
            { icon: Crown, label: "Largest Team" },
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
                <FolderKanban className="size-8 text-foreground" />
              </motion.div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 0.5 }}
                className="absolute -top-2 -right-3 flex size-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/60 ring-2 ring-blue-100/50 dark:ring-blue-900/30"
              >
                <Users className="size-4 text-blue-600 dark:text-blue-400" />
              </motion.div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 0.6 }}
                className="absolute -bottom-1 -left-3 flex size-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/60 ring-2 ring-amber-100/50 dark:ring-amber-900/30"
              >
                <Target className="size-3.5 text-amber-600 dark:text-amber-400" />
              </motion.div>
            </div>

            <motion.h3
              {...anim(0.4)}
              className="text-lg font-semibold"
            >
              Organize your workspace
            </motion.h3>
            <motion.p
              {...anim(0.45)}
              className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed"
            >
              Create teams to group members together, streamline collaboration, and assign projects efficiently across your organization.
            </motion.p>

            {/* Steps */}
            <motion.div
              {...anim(0.5)}
              className="mt-8 flex flex-col sm:flex-row items-center gap-3 sm:gap-6"
            >
              <div className="flex items-center gap-2.5 rounded-lg border bg-card px-4 py-2.5 shadow-sm">
                <div className="flex size-6 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-xs font-bold text-emerald-700 dark:text-emerald-300">1</div>
                <span className="text-sm font-medium">Create a team</span>
              </div>
              <div className="hidden sm:block h-px w-6 bg-muted-foreground/20" />
              <div className="sm:hidden w-px h-4 bg-muted-foreground/20" />
              <div className="flex items-center gap-2.5 rounded-lg border bg-card px-4 py-2.5 shadow-sm opacity-60">
                <div className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">2</div>
                <span className="text-sm font-medium text-muted-foreground">Add members</span>
              </div>
              <div className="hidden sm:block h-px w-6 bg-muted-foreground/20" />
              <div className="sm:hidden w-px h-4 bg-muted-foreground/20" />
              <div className="flex items-center gap-2.5 rounded-lg border bg-card px-4 py-2.5 shadow-sm opacity-40">
                <div className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">3</div>
                <span className="text-sm font-medium text-muted-foreground">Assign projects</span>
              </div>
            </motion.div>

            <motion.div {...anim(0.55)} className="mt-8">
              <Button
                onClick={openCreateSheet}
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
              >
                <Plus className="mr-2 size-4" />
                Create Your First Team
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Ghost team cards */}
        <motion.div {...anim(0.6)} className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground/50">Your Teams</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-dashed border-muted-foreground/15 bg-card p-4 overflow-hidden"
                style={{ opacity: 1 - (i - 1) * 0.25 }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-1 h-10 rounded-full bg-muted/40" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-28 rounded bg-muted/40" />
                    <div className="h-3 w-40 rounded bg-muted/30" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex -space-x-1.5">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="size-6 rounded-full bg-muted/40 ring-2 ring-card" />
                    ))}
                  </div>
                  <div className="h-3 w-16 rounded bg-muted/30 ml-1" />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <CreateTeamSheet
          open={createOpen}
          setOpen={setCreateOpen}
          name={createName}
          setName={setCreateName}
          desc={createDesc}
          setDesc={setCreateDesc}
          color={createColor}
          setColor={setCreateColor}
          saving={createSaving}
          onSave={handleCreateTeam}
        />
      </ContentReveal>
    );
  }

  /* ── Data state ── */
  return (
    <ContentReveal className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

        <motion.div {...anim(0.1)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BarChart3 className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Avg Team Size</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
            {avgTeamSize}
          </p>
        </motion.div>

        <motion.div {...anim(0.15)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Crown className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Largest Team</span>
          </div>
          <p className="mt-2 text-sm font-bold truncate" title={largestTeam?.name}>
            {largestTeam ? (
              <span className="flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: largestTeam.color || "#6b7280" }}
                />
                <span className="truncate">{largestTeam.name}</span>
                <span className="text-muted-foreground font-normal text-xs ml-auto shrink-0">
                  {getMemberCount(largestTeam)} members
                </span>
              </span>
            ) : (
              "-"
            )}
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
              {filtered.map((team, index) => {
                const memberCount = getMemberCount(team);
                const color = getTeamColor(team, index);
                return (
                  <motion.button
                    key={team.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.04 }}
                    onClick={() => router.push(`/teams/${team.id}`)}
                    className="group relative rounded-xl border bg-card text-left hover:bg-muted/50 transition-colors overflow-hidden"
                  >
                    {/* Colored accent bar */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                      style={{ backgroundColor: color }}
                    />

                    <div className="p-4 pl-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{team.name}</p>
                          </div>
                          {team.description ? (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {team.description}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground/50 mt-1 italic">
                              No description
                            </p>
                          )}
                        </div>
                        <span
                          className="size-3 rounded-full shrink-0 mt-1 ring-2 ring-card"
                          style={{ backgroundColor: color }}
                        />
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {/* Member avatar stack */}
                          {team.members && team.members.length > 0 ? (
                            <div className="flex -space-x-1.5">
                              {team.members.slice(0, 4).map((m, mi) => (
                                <div
                                  key={m.id}
                                  className="flex size-6 items-center justify-center rounded-full bg-muted text-[9px] font-medium ring-2 ring-card"
                                  title={m.name}
                                >
                                  {m.name ? getInitials(m.name) : "?"}
                                </div>
                              ))}
                              {team.members.length > 4 && (
                                <div className="flex size-6 items-center justify-center rounded-full bg-muted text-[9px] font-medium ring-2 ring-card text-muted-foreground">
                                  +{team.members.length - 4}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Users className="size-3.5" />
                            </div>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {memberCount} {memberCount === 1 ? "member" : "members"}
                          </span>
                        </div>

                        <Badge
                          variant="outline"
                          className="text-[10px] border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400"
                        >
                          <FolderKanban className="size-2.5 mr-0.5" />
                          Team
                        </Badge>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </MotionConfig>
      )}

      <CreateTeamSheet
        open={createOpen}
        setOpen={setCreateOpen}
        name={createName}
        setName={setCreateName}
        desc={createDesc}
        setDesc={setCreateDesc}
        color={createColor}
        setColor={setCreateColor}
        saving={createSaving}
        onSave={handleCreateTeam}
      />
    </ContentReveal>
  );
}

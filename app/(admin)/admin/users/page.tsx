"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ShieldCheck,
  User,
  MoreHorizontal,
  Shield,
  ShieldOff,
  Building2,
  ArrowUpDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/lib/hooks/use-debounce";

interface PlatformUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  isSiteAdmin: boolean;
  createdAt: string;
  orgCount: number;
}

type SortKey = "name" | "email" | "created" | "orgs";

export default function AdminUsersPage() {
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("created");
  const [sortAsc, setSortAsc] = useState(false);
  const debouncedSearch = useDebounce(search, 200);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/users");
      const data = await res.json();
      setPlatformUsers(data.users || []);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const toggleAdmin = async (userId: string, current: boolean) => {
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSiteAdmin: !current }),
      });
      if (!res.ok) throw new Error();
      setPlatformUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isSiteAdmin: !current } : u))
      );
      toast.success(!current ? "Granted admin access" : "Revoked admin access");
    } catch {
      toast.error("Failed to update user");
    }
  };

  const hasFilters = roleFilter !== "all" || debouncedSearch !== "";

  const filtered = useMemo(() => {
    let result = platformUsers;

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (u) =>
          (u.name || "").toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
      );
    }

    if (roleFilter === "admin") {
      result = result.filter((u) => u.isSiteAdmin);
    } else if (roleFilter === "user") {
      result = result.filter((u) => !u.isSiteAdmin);
    } else if (roleFilter === "no-org") {
      result = result.filter((u) => u.orgCount === 0);
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = (a.name || a.email).localeCompare(b.name || b.email);
      else if (sortBy === "email") cmp = a.email.localeCompare(b.email);
      else if (sortBy === "orgs") cmp = a.orgCount - b.orgCount;
      else cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [platformUsers, debouncedSearch, roleFilter, sortBy, sortAsc]);

  const clearFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setSortBy("created");
    setSortAsc(false);
  };

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">
            All registered users across the platform
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name or email..."
            className="w-56"
          />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="admin">Admins Only</SelectItem>
              <SelectItem value="user">Regular Users</SelectItem>
              <SelectItem value="no-org">No Organization</SelectItem>
            </SelectContent>
          </Select>
          <Select value={`${sortBy}-${sortAsc ? "asc" : "desc"}`} onValueChange={(v) => {
            const [key, dir] = v.split("-") as [SortKey, string];
            setSortBy(key);
            setSortAsc(dir === "asc");
          }}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <ArrowUpDown className="size-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created-desc">Newest First</SelectItem>
              <SelectItem value="created-asc">Oldest First</SelectItem>
              <SelectItem value="name-asc">Name A-Z</SelectItem>
              <SelectItem value="name-desc">Name Z-A</SelectItem>
              <SelectItem value="email-asc">Email A-Z</SelectItem>
              <SelectItem value="orgs-desc">Most Orgs</SelectItem>
              <SelectItem value="orgs-asc">Fewest Orgs</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearFilters}>
              <X className="size-3" />
              Clear
            </Button>
          )}
          {!loading && (
            <Badge variant="secondary" className="text-xs ml-auto">
              {filtered.length} of {platformUsers.length}
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {filtered.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {(u.name || u.email).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {u.name || u.email}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                  <Building2 className="size-3" />
                  {u.orgCount}
                </div>
                <p className="hidden md:block text-xs text-muted-foreground tabular-nums">
                  {new Date(u.createdAt).toLocaleDateString()}
                </p>
                {u.isSiteAdmin ? (
                  <Badge
                    variant="outline"
                    className="gap-1 text-[11px] text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/50"
                  >
                    <ShieldCheck className="size-3" />
                    Admin
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="gap-1 text-[11px] text-zinc-600 bg-zinc-50 dark:text-zinc-400 dark:bg-zinc-800/50"
                  >
                    <User className="size-3" />
                    User
                  </Badge>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7">
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => toggleAdmin(u.id, u.isSiteAdmin)}>
                      {u.isSiteAdmin ? (
                        <>
                          <ShieldOff className="size-3.5 mr-2" />
                          Revoke Admin
                        </>
                      ) : (
                        <>
                          <Shield className="size-3.5 mr-2" />
                          Grant Admin
                        </>
                      )}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No users found
              </div>
            )}
          </div>
        )}
      </div>
    </ContentReveal>
  );
}

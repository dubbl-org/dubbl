"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchInput } from "@/components/ui/search-input";
import { Building2, Users, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/lib/hooks/use-debounce";

interface Org {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  country: string | null;
  businessType: string | null;
  defaultCurrency: string;
  createdAt: string;
  deletedAt: string | null;
  memberCount: number;
  plan: string;
  subscriptionStatus: string | null;
  customPlanName: string | null;
  managedBy: string | null;
  seatCount: number | null;
}

const PLAN_BADGE: Record<string, string> = {
  free: "text-zinc-600 bg-zinc-50 dark:text-zinc-400 dark:bg-zinc-800/50",
  pro: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/50",
  business: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50",
};

export default function AdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);

  const fetchOrgs = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/organizations");
      const data = await res.json();
      setOrgs(data.organizations || []);
    } catch {
      toast.error("Failed to load organizations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const filtered = debouncedSearch
    ? orgs.filter(
        (o) =>
          o.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          o.slug.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : orgs;

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Organizations</h2>
          <p className="text-sm text-muted-foreground">
            All organizations on the platform
          </p>
        </div>

        <div className="flex items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search organizations..."
            className="w-64"
          />
          {!loading && (
            <Badge variant="secondary" className="text-xs">
              {filtered.length} orgs
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {filtered.map((o) => {
              const displayPlan = o.customPlanName || o.plan;
              const isEnterprise = o.managedBy === "manual";
              return (
                <Link
                  key={o.id}
                  href={`/admin/organizations/${o.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold">
                    {o.logo ? (
                      <Image src={o.logo} alt="" width={36} height={36} className="size-9 rounded-lg object-cover" />
                    ) : (
                      <Building2 className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{o.name}</p>
                      {o.deletedAt && (
                        <Badge variant="outline" className="text-[10px] text-red-500">
                          Deleted
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.slug} · {o.defaultCurrency}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    {o.memberCount}
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[11px] capitalize ${isEnterprise ? "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/50" : PLAN_BADGE[o.plan] || ""}`}
                  >
                    {isEnterprise ? displayPlan : o.plan}
                  </Badge>
                  <ChevronRight className="size-3.5 text-muted-foreground/50 shrink-0" />
                </Link>
              );
            })}
            {filtered.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No organizations found
              </div>
            )}
          </div>
        )}
      </div>
    </ContentReveal>
  );
}

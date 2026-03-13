"use client";

import { useState, useEffect, useCallback } from "react";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Building2,
  UserPlus,
  Crown,
  TrendingUp,
} from "lucide-react";

interface Stats {
  totalUsers: number;
  totalOrgs: number;
  totalMembers: number;
  recentUsers: number;
  recentOrgs: number;
  enterpriseOrgs: number;
  planBreakdown: { plan: string; count: number }[];
}

const PLAN_COLORS: Record<string, string> = {
  free: "bg-zinc-200 dark:bg-zinc-700",
  pro: "bg-blue-500",
  business: "bg-emerald-500",
};

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/stats");
      const data = await res.json();
      setStats(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  if (!stats) return null;

  const totalPlans = stats.planBreakdown.reduce((s, r) => s + r.count, 0);

  return (
    <ContentReveal>
      <div className="space-y-8">
        <div>
          <h2 className="text-lg font-semibold">Admin Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Platform overview and key metrics
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Total Users"
            value={stats.totalUsers}
            sub={`+${stats.recentUsers} last 30d`}
          />
          <StatCard
            icon={Building2}
            label="Organizations"
            value={stats.totalOrgs}
            sub={`+${stats.recentOrgs} last 30d`}
          />
          <StatCard
            icon={Crown}
            label="Enterprise"
            value={stats.enterpriseOrgs}
            sub="Manually managed"
          />
          <StatCard
            icon={UserPlus}
            label="Total Members"
            value={stats.totalMembers}
            sub="Across all orgs"
          />
        </div>

        {/* Plan distribution */}
        <div className="rounded-lg border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Plan Distribution</h3>
          </div>

          {/* Bar */}
          <div className="flex h-3 rounded-full overflow-hidden bg-muted">
            {stats.planBreakdown
              .sort((a, b) => {
                const order = ["free", "pro", "business"];
                return order.indexOf(a.plan) - order.indexOf(b.plan);
              })
              .map((r) => (
                <div
                  key={r.plan}
                  className={`${PLAN_COLORS[r.plan] || "bg-gray-400"} transition-all`}
                  style={{ width: `${totalPlans > 0 ? (r.count / totalPlans) * 100 : 0}%` }}
                />
              ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4">
            {stats.planBreakdown
              .sort((a, b) => {
                const order = ["free", "pro", "business"];
                return order.indexOf(a.plan) - order.indexOf(b.plan);
              })
              .map((r) => (
                <div key={r.plan} className="flex items-center gap-2">
                  <div className={`size-2.5 rounded-full ${PLAN_COLORS[r.plan] || "bg-gray-400"}`} />
                  <span className="text-xs text-muted-foreground">
                    {PLAN_LABELS[r.plan] || r.plan} - {r.count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </ContentReveal>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

"use client";

import { BarChart3, Target, TrendingUp, DollarSign } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useApi } from "@/lib/query/use-api";

interface Analytics {
  totalDeals: number;
  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  totalPipelineValue: number;
  wonValue: number;
  conversionRate: number;
  avgDealValue: number;
  stageDistribution: Record<string, { name?: string; count: number; value: number }>;
  lostReasons?: { reason: string; count: number; value: number }[];
}

export default function CRMAnalyticsPage() {
  const { data, loading } = useApi<Analytics>("/api/v1/crm/analytics");
  useDocumentTitle("CRM · Analytics");

  if (loading) return <BrandLoader />;
  if (!data) return null;

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Pipeline Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Overview of your sales pipeline performance.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Pipeline Value"
            value={formatMoney(data.totalPipelineValue)}
            icon={DollarSign}
          />
          <StatCard
            title="Won Revenue"
            value={formatMoney(data.wonValue)}
            icon={TrendingUp}
            changeType="positive"
          />
          <StatCard
            title="Conversion Rate"
            value={`${data.conversionRate}%`}
            icon={Target}
          />
          <StatCard
            title="Avg Deal Size"
            value={formatMoney(data.avgDealValue)}
            icon={BarChart3}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border bg-card p-5">
            <h3 className="text-sm font-medium mb-4">Deal Summary</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Deals</span>
                <span className="font-medium">{data.totalDeals}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Open</span>
                <span className="font-medium text-blue-600">{data.openDeals}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Won</span>
                <span className="font-medium text-brand-600">{data.wonDeals}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Lost</span>
                <span className="font-medium text-red-600">{data.lostDeals}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-5">
            <h3 className="text-sm font-medium mb-4">Stage Distribution</h3>
            <div className="space-y-2">
              {Object.entries(data.stageDistribution || {}).map(([stage, info]) => (
                <div key={stage} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{info.name || stage.replace(/_/g, " ")}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{info.count} {info.count === 1 ? "deal" : "deals"}</span>
                    <span className="font-mono text-xs font-medium tabular-nums">{formatMoney(info.value)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5">
          <h3 className="text-sm font-medium">Why deals were lost</h3>
          <p className="text-xs text-muted-foreground mb-4">The reasons given when deals were marked lost, most common first.</p>
          {(data.lostReasons ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No lost deals yet.</p>
          ) : (
            <div className="space-y-2.5">
              {(data.lostReasons ?? []).map((r) => {
                const share = data.lostDeals > 0 ? Math.round((r.count / data.lostDeals) * 100) : 0;
                return (
                  <div key={r.reason} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{r.reason}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">{r.count} {r.count === 1 ? "deal" : "deals"} · {share}%</span>
                        <span className="font-mono text-xs font-medium tabular-nums">{formatMoney(r.value)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-red-400" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ContentReveal>
  );
}

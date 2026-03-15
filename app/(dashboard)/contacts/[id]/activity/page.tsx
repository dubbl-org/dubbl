"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { X, Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContentReveal } from "@/components/ui/content-reveal";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { DatePicker } from "@/components/ui/date-picker";
import { useContactContext, getOrgId, activityTypeConfig } from "../layout";
import type { ActivityItem } from "../layout";

export default function ContactActivityPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useContactContext();

  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [activityHasMore, setActivityHasMore] = useState(true);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [activityStartDate, setActivityStartDate] = useState("");
  const [activityEndDate, setActivityEndDate] = useState("");
  const [activityTypeFilter, setActivityTypeFilter] = useState("all");
  const activitySentinelRef = useRef<HTMLDivElement>(null);

  const fetchActivity = useCallback(
    (cursor?: string | null) => {
      const orgId = getOrgId();
      if (!orgId) return;

      const isLoadMore = !!cursor;
      if (isLoadMore) {
        setActivityLoadingMore(true);
      } else {
        setActivityCursor(null);
        setActivityHasMore(true);
        setActivityLoading(true);
      }

      const params = new URLSearchParams({ limit: "30" });
      if (cursor) params.set("cursor", cursor);
      if (activityStartDate) params.set("startDate", activityStartDate);
      if (activityEndDate) params.set("endDate", activityEndDate);
      if (activityTypeFilter !== "all") params.set("type", activityTypeFilter);

      fetch(`/api/v1/contacts/${id}/activity?${params}`, {
        headers: { "x-organization-id": orgId },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.activity) {
            setActivityItems((prev) => isLoadMore ? [...prev, ...data.activity] : data.activity);
          }
          setActivityHasMore(data.hasMore ?? false);
          setActivityCursor(data.nextCursor ?? null);
        })
        .catch(() => {})
        .finally(() => {
          setActivityLoading(false);
          setActivityLoadingMore(false);
        });
    },
    [id, activityStartDate, activityEndDate, activityTypeFilter]
  );

  // Fetch activity on mount and when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState occurs in async .then(), not synchronously
    fetchActivity(null);
  }, [fetchActivity]);

  // Infinite scroll
  const loadMoreActivity = useCallback(() => {
    if (activityLoadingMore || !activityHasMore || !activityCursor) return;
    fetchActivity(activityCursor);
  }, [activityLoadingMore, activityHasMore, activityCursor, fetchActivity]);

  useEffect(() => {
    const el = activitySentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreActivity(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMoreActivity]);

  return (
    <ContentReveal key="activity">
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="invoice">Invoices</SelectItem>
              <SelectItem value="quote">Quotes</SelectItem>
              <SelectItem value="credit_note">Credit Notes</SelectItem>
              <SelectItem value="payment">Payments</SelectItem>
              <SelectItem value="bill">Bills</SelectItem>
            </SelectContent>
          </Select>
          <DatePicker
            value={activityStartDate}
            onChange={setActivityStartDate}
            placeholder="From date"
            className="w-36 h-8 text-sm"
          />
          <DatePicker
            value={activityEndDate}
            onChange={setActivityEndDate}
            placeholder="To date"
            className="w-36 h-8 text-sm"
          />
          {(activityStartDate || activityEndDate || activityTypeFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => {
                setActivityStartDate("");
                setActivityEndDate("");
                setActivityTypeFilter("all");
              }}
            >
              <X className="mr-1 size-3" />
              Clear
            </Button>
          )}
        </div>

        {activityLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="brand-loader" aria-label="Loading">
              <div className="brand-loader-circle brand-loader-circle-1" />
              <div className="brand-loader-circle brand-loader-circle-2" />
            </div>
          </div>
        )}

        {!activityLoading && activityItems.length === 0 && (
          <ContentReveal key={`activity-empty-${activityTypeFilter}-${activityStartDate}-${activityEndDate}`}>
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-dashed">
              <Activity className="mb-2 size-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No activity found</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {activityStartDate || activityEndDate || activityTypeFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Invoices, quotes, payments, and bills will appear here"}
              </p>
            </div>
          </ContentReveal>
        )}

        {!activityLoading && activityItems.length > 0 && (
          <ContentReveal key={`activity-list-${activityTypeFilter}-${activityStartDate}-${activityEndDate}`}>
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

              <div className="space-y-1">
                {activityItems.map((item) => {
                  const config = activityTypeConfig[item.type];
                  const Icon = config.icon;
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      onClick={() => router.push(config.href(item.id))}
                      className="relative flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className={cn("relative z-10 flex size-[38px] shrink-0 items-center justify-center rounded-full border bg-card", config.bg)}>
                        <Icon className={cn("size-4", config.color)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{item.number}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {config.label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                            {item.status.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(item.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <span className="text-sm font-medium tabular-nums">
                        {item.type === "credit_note" ? "-" : ""}
                        {formatMoney(item.amount, item.currencyCode)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Infinite scroll sentinel */}
            {activityHasMore && (
              <div ref={activitySentinelRef} className="flex items-center justify-center py-4">
                {activityLoadingMore && (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                )}
              </div>
            )}
          </ContentReveal>
        )}
      </div>
    </ContentReveal>
  );
}

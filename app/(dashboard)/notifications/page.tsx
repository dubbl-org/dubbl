"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  FileText,
  DollarSign,
  Package,
  Landmark,
  ShieldCheck,
  AlertTriangle,
  ClipboardList,
  CheckCheck,
  Filter,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  invoice_overdue: FileText,
  payment_received: DollarSign,
  inventory_low: Package,
  payroll_due: Landmark,
  approval_needed: ShieldCheck,
  system_alert: AlertTriangle,
  task_assigned: ClipboardList,
};

const TYPE_COLORS: Record<string, string> = {
  invoice_overdue: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/50",
  payment_received: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50",
  inventory_low: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/50",
  payroll_due: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/50",
  approval_needed: "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/50",
  system_alert: "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/50",
  task_assigned: "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/50",
};

function relativeTime(date: string) {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const params = new URLSearchParams();
    if (filter === "unread") params.set("unread", "true");
    params.set("limit", "100");

    fetch(`/api/v1/notifications?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setNotifications(data.data);
        if (data.unreadCount !== undefined) setUnreadCount(data.unreadCount);
      })
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    await fetch(`/api/v1/notifications/${id}/read`, {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    await fetch("/api/v1/notifications/read-all", {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
    );
    setUnreadCount(0);
  };

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Notifications</h2>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
                : "All caught up"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={markAllRead}>
                <CheckCheck className="mr-1.5 size-3" />
                Mark all read
              </Button>
            )}
          </div>
        </div>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">
              Unread
              {unreadCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <Bell className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-medium">No notifications</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {filter === "unread" ? "No unread notifications" : "You're all caught up"}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] || Bell;
              const colorClass = TYPE_COLORS[n.type] || "text-muted-foreground bg-muted";
              const isUnread = !n.readAt;

              return (
                <button
                  key={n.id}
                  onClick={() => !n.readAt && markAsRead(n.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/50",
                    isUnread && "bg-muted/30"
                  )}
                >
                  <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", colorClass)}>
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-sm truncate", isUnread && "font-medium")}>
                        {n.title}
                      </p>
                      {isUnread && (
                        <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />
                      )}
                    </div>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground/60">
                      {relativeTime(n.createdAt)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </ContentReveal>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
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
  Inbox,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { cn } from "@/lib/utils";
import Link from "next/link";

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
  invoice_overdue: "text-red-500 bg-red-500/10",
  payment_received: "text-emerald-500 bg-emerald-500/10",
  inventory_low: "text-amber-500 bg-amber-500/10",
  payroll_due: "text-blue-500 bg-blue-500/10",
  approval_needed: "text-purple-500 bg-purple-500/10",
  system_alert: "text-orange-500 bg-orange-500/10",
  task_assigned: "text-indigo-500 bg-indigo-500/10",
};

const TYPE_LABELS: Record<string, string> = {
  invoice_overdue: "Invoice",
  payment_received: "Payment",
  inventory_low: "Inventory",
  payroll_due: "Payroll",
  approval_needed: "Approval",
  system_alert: "System",
  task_assigned: "Task",
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

function groupByDate(notifications: Notification[]) {
  const groups: { label: string; items: Notification[] }[] = [];
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayStr = today.toDateString();
  const yesterdayStr = yesterday.toDateString();

  const map = new Map<string, Notification[]>();

  for (const n of notifications) {
    const d = new Date(n.createdAt);
    const ds = d.toDateString();
    let label: string;

    if (ds === todayStr) label = "Today";
    else if (ds === yesterdayStr) label = "Yesterday";
    else label = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });

    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(n);
  }

  for (const [label, items] of map) {
    groups.push({ label, items });
  }

  return groups;
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

  const groups = groupByDate(notifications);

  return (
    <ContentReveal>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
              <Bell className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Notifications</h2>
              <p className="text-sm text-muted-foreground">
                {unreadCount > 0
                  ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
                  : "All caught up"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={markAllRead}>
                <CheckCheck className="size-3" />
                Mark all read
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" asChild>
              <Link href="/settings/notifications">
                <Settings2 className="size-3" />
                Preferences
              </Link>
            </Button>
          </div>
        </div>

        {/* Filter tabs */}
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

        {/* Notification list */}
        {notifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
              <Inbox className="size-8 text-muted-foreground/50" />
            </div>
            <h3 className="mt-5 text-sm font-medium">
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </h3>
            <p className="mt-1.5 text-xs text-muted-foreground max-w-[250px]">
              {filter === "unread"
                ? "You've read all your notifications. Nice work!"
                : "When something important happens, you'll see it here."}
            </p>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xs font-medium text-muted-foreground">{group.label}</h3>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="rounded-lg border overflow-hidden divide-y">
                  <AnimatePresence initial={false}>
                    {group.items.map((n, i) => {
                      const Icon = TYPE_ICONS[n.type] || Bell;
                      const colorClass = TYPE_COLORS[n.type] || "text-muted-foreground bg-muted";
                      const typeLabel = TYPE_LABELS[n.type] || "Notification";
                      const isUnread = !n.readAt;

                      return (
                        <motion.div
                          key={n.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3, delay: i * 0.04 }}
                        >
                          <button
                            onClick={() => isUnread && markAsRead(n.id)}
                            className={cn(
                              "flex w-full items-start gap-3.5 px-4 py-3.5 text-left transition-all group",
                              isUnread
                                ? "bg-primary/[0.02] hover:bg-primary/[0.05]"
                                : "hover:bg-muted/50"
                            )}
                          >
                            <div className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
                              colorClass,
                            )}>
                              <Icon className="size-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={cn(
                                      "text-[10px] font-medium uppercase tracking-wider",
                                      isUnread ? "text-foreground/40" : "text-muted-foreground/40"
                                    )}>
                                      {typeLabel}
                                    </span>
                                    {isUnread && (
                                      <motion.span
                                        layoutId={`dot-${n.id}`}
                                        className="size-1.5 rounded-full bg-blue-500"
                                      />
                                    )}
                                  </div>
                                  <p className={cn(
                                    "text-[13px] leading-snug mt-0.5",
                                    isUnread ? "font-medium text-foreground" : "text-foreground/80"
                                  )}>
                                    {n.title}
                                  </p>
                                  {n.body && (
                                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                      {n.body}
                                    </p>
                                  )}
                                </div>
                                <span className="text-[11px] text-muted-foreground/50 tabular-nums shrink-0 pt-3">
                                  {relativeTime(n.createdAt)}
                                </span>
                              </div>
                            </div>
                          </button>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ContentReveal>
  );
}

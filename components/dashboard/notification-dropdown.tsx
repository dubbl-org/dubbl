"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  invoice_overdue: "text-red-500 bg-red-500/10",
  payment_received: "text-emerald-500 bg-emerald-500/10",
  inventory_low: "text-amber-500 bg-amber-500/10",
  payroll_due: "text-blue-500 bg-blue-500/10",
  approval_needed: "text-purple-500 bg-purple-500/10",
  system_alert: "text-orange-500 bg-orange-500/10",
  task_assigned: "text-indigo-500 bg-indigo-500/10",
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

export function NotificationDropdown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(() => {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    if (!orgId) return;
    setLoading(true);

    fetch("/api/v1/notifications?limit=8", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setNotifications(data.data);
        if (data.unreadCount !== undefined) setUnreadCount(data.unreadCount);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch unread count on mount
  useEffect(() => {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    if (!orgId) return;
    fetch("/api/v1/notifications?unread=true&limit=1", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.unreadCount !== undefined) setUnreadCount(data.unreadCount);
      })
      .catch(() => {});
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-7"
        >
          <Bell className="size-3.5" />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-medium text-white"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[380px] p-0 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] font-semibold"
              >
                {unreadCount}
              </motion.span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCheck className="size-3" />
              Mark all read
            </button>
          )}
        </div>

        {/* Notification list */}
        <div className="max-h-[400px] overflow-y-auto overscroll-contain">
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="size-5 rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
                <Bell className="size-5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium text-muted-foreground">All caught up</p>
              <p className="mt-0.5 text-xs text-muted-foreground/60">No notifications yet</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {notifications.map((n, i) => {
                const Icon = TYPE_ICONS[n.type] || Bell;
                const colorClass = TYPE_COLORS[n.type] || "text-muted-foreground bg-muted";
                const isUnread = !n.readAt;

                return (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                  >
                    <button
                      onClick={(e) => {
                        if (isUnread) markAsRead(n.id, e);
                      }}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-all hover:bg-muted/50 group border-b border-border/50 last:border-0",
                        isUnread && "bg-primary/[0.03]"
                      )}
                    >
                      <div className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
                        colorClass,
                      )}>
                        <Icon className="size-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            "text-[13px] leading-snug",
                            isUnread ? "font-medium text-foreground" : "text-muted-foreground"
                          )}>
                            {n.title}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                            <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                              {relativeTime(n.createdAt)}
                            </span>
                            {isUnread && (
                              <motion.span
                                layoutId={`unread-${n.id}`}
                                className="size-1.5 rounded-full bg-blue-500"
                              />
                            )}
                          </div>
                        </div>
                        {n.body && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground/70 line-clamp-1">
                            {n.body}
                          </p>
                        )}
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
              className="flex w-full items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              View all notifications
              <ArrowRight className="size-3" />
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

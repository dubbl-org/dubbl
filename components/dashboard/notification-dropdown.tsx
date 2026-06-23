"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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

interface ApprovalRequest {
  id: string;
  entityType: "bill" | "expense" | "invoice" | "journal_entry" | "purchase_order";
  entityId: string;
  status: string;
  currentStepOrder: number;
  createdAt: string;
  requestedBy?: { user?: { name?: string | null; email?: string | null } | null } | null;
}

// Plain-language label for what is awaiting sign-off
const APPROVAL_ENTITY_LABELS: Record<ApprovalRequest["entityType"], string> = {
  bill: "Bill",
  expense: "Expense",
  invoice: "Invoice",
  journal_entry: "Journal entry",
  purchase_order: "Purchase order",
};

// Where the user goes to review and sign off on each item
function approvalEntityHref(req: ApprovalRequest): string {
  switch (req.entityType) {
    case "bill":
      return `/purchases/${req.entityId}`;
    case "purchase_order":
      return `/purchases/orders/${req.entityId}`;
    case "expense":
      return `/purchases/expenses/${req.entityId}`;
    case "invoice":
      return `/sales/${req.entityId}`;
    case "journal_entry":
      return `/accounting/${req.entityId}`;
    default:
      return "/notifications";
  }
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
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);

  // Resolve the current user's member id (approvals are keyed by member, not user)
  const resolveMemberId = useCallback(async (orgId: string): Promise<string | null> => {
    if (!userId) return null;
    try {
      const res = await fetch("/api/v1/members", {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      const mine = (data.members as { id: string; userId: string }[] | undefined)?.find(
        (m) => m.userId === userId
      );
      return mine?.id ?? null;
    } catch {
      return null;
    }
  }, [userId]);

  const fetchApprovals = useCallback(async () => {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    if (!orgId) return;
    const memberId = await resolveMemberId(orgId);
    if (!memberId) {
      setApprovals([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/v1/approval-requests?status=pending&approverId=${memberId}&limit=8`,
        { headers: { "x-organization-id": orgId } }
      );
      const data = await res.json();
      if (Array.isArray(data.data)) setApprovals(data.data as ApprovalRequest[]);
    } catch {
      // ignore
    }
  }, [resolveMemberId]);

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
        setHasFetched(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch unread count + pending approvals on mount (for the bell badge)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchApprovals();
  }, [fetchApprovals]);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      fetchNotifications();
      fetchApprovals();
    }
  }, [fetchNotifications, fetchApprovals]);

  const markAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));

    await fetch(`/api/v1/notifications/${id}/read`, {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });
  };

  const markAllRead = async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
    );
    setUnreadCount(0);

    await fetch("/api/v1/notifications/read-all", {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });
  };

  const approvalCount = approvals.length;
  const badgeCount = unreadCount + approvalCount;

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
            {badgeCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-medium text-white"
              >
                {badgeCount > 9 ? "9+" : badgeCount}
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
              <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] font-semibold">
                {unreadCount}
              </span>
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
          {/* Pending approvals awaiting this user's sign-off */}
          {approvalCount > 0 && (
            <div className="border-b">
              <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3 text-purple-500" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Waiting for you to approve
                  </span>
                </div>
                <span className="flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-semibold">
                  {approvalCount}
                </span>
              </div>
              {approvals.map((req) => {
                const requester =
                  req.requestedBy?.user?.name ||
                  req.requestedBy?.user?.email ||
                  "Someone";
                return (
                  <button
                    key={req.id}
                    onClick={() => {
                      setOpen(false);
                      router.push(approvalEntityHref(req));
                    }}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 group border-b border-border/50 last:border-0 bg-purple-500/[0.03]"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg text-purple-500 bg-purple-500/10">
                      <ShieldCheck className="size-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] leading-snug font-medium text-foreground">
                          {APPROVAL_ENTITY_LABELS[req.entityType]} needs your approval
                        </p>
                        <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0 pt-0.5">
                          {relativeTime(req.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/70 line-clamp-1">
                        Sent by {requester} &middot; Tap to review &amp; sign off
                      </p>
                    </div>
                    <ArrowRight className="size-3 shrink-0 self-center text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                  </button>
                );
              })}
            </div>
          )}

          {loading && !hasFetched ? (
            <div className="flex items-center justify-center py-12">
              <div className="size-5 rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            approvalCount > 0 ? null : (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
                <Bell className="size-5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium text-muted-foreground">All caught up</p>
              <p className="mt-0.5 text-xs text-muted-foreground/60">No notifications yet</p>
            </div>
            )
          ) : (
            notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] || Bell;
              const colorClass = TYPE_COLORS[n.type] || "text-muted-foreground bg-muted";
              const isUnread = !n.readAt;

              return (
                <button
                  key={n.id}
                  onClick={(e) => {
                    if (isUnread) markAsRead(n.id, e);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 group border-b border-border/50 last:border-0",
                    isUnread && "bg-primary/[0.03]"
                  )}
                >
                  <div className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
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
                          <span className="size-1.5 rounded-full bg-blue-500" />
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
              );
            })
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

"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  ArrowLeftRight,
  BookOpen,
  Users,
  Settings,
  ShoppingCart,
  Receipt,
  Wallet,
  Landmark,
  type LucideIcon,
} from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userName: string;
  createdAt: string;
}

const ENTITY_ICONS: Record<string, LucideIcon> = {
  entry: ArrowLeftRight,
  account: BookOpen,
  invoice: FileText,
  bill: ShoppingCart,
  quote: Receipt,
  expense: Wallet,
  contact: Users,
  banking: Landmark,
  settings: Settings,
};

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function ActivitySkeleton() {
  return (
    <div className="space-y-0 divide-y">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-3 px-1">
          <Skeleton className="size-7 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActivityFeed() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = localStorage.getItem("activeOrgId");
    if (!id) return;

    fetch("/api/v1/audit-log?limit=15", {
      headers: { "x-organization-id": id },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setEntries(data.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-3 border-b">
        <h3 className="text-[13px] font-semibold">Recent Activity</h3>
      </div>
      <div className="px-3">
        {loading ? (
          <ActivitySkeleton />
        ) : entries.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[13px] text-muted-foreground">
              Actions like creating invoices will appear here
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {entries.map((entry) => {
              const Icon = ENTITY_ICONS[entry.entityType] || ArrowLeftRight;
              return (
                <div key={entry.id} className="flex items-start gap-3 py-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] leading-snug">
                      <span className="font-medium">{entry.userName}</span>{" "}
                      <span className="text-muted-foreground">
                        {entry.action} {entry.entityType}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                      {getRelativeTime(entry.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

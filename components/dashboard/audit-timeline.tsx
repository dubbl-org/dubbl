"use client";

import { Badge } from "@/components/ui/badge";

interface AuditTimelineEntry {
  id: string;
  action: string;
  userName: string;
  createdAt: string;
  changes?: Record<string, unknown>;
}

interface AuditTimelineProps {
  entries: AuditTimelineEntry[];
}

const ACTION_COLORS: Record<string, string> = {
  create: "bg-green-500",
  update: "bg-blue-500",
  delete: "bg-red-500",
  post: "bg-purple-500",
  void: "bg-orange-500",
  approve: "bg-emerald-500",
};

const ACTION_BADGE_COLORS: Record<string, string> = {
  create: "border-green-200 bg-green-50 text-green-700",
  update: "border-blue-200 bg-blue-50 text-blue-700",
  delete: "border-red-200 bg-red-50 text-red-700",
  post: "border-purple-200 bg-purple-50 text-purple-700",
  void: "border-orange-200 bg-orange-50 text-orange-700",
  approve: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function AuditTimeline({ entries }: AuditTimelineProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No activity recorded.</p>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

      {entries.map((entry) => (
        <div key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
          {/* Dot */}
          <div
            className={`relative z-10 mt-1.5 size-[15px] shrink-0 rounded-full border-2 border-background ${
              ACTION_COLORS[entry.action] || "bg-gray-500"
            }`}
          />

          {/* Content */}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{entry.userName}</span>
              <Badge
                variant="outline"
                className={ACTION_BADGE_COLORS[entry.action] || ""}
              >
                {entry.action}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(entry.createdAt).toLocaleString()}
            </p>

            {entry.changes && Object.keys(entry.changes).length > 0 && (
              <div className="mt-2 rounded-md border bg-muted/50 p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Changes
                </p>
                <div className="space-y-1">
                  {Object.entries(entry.changes).map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-xs">
                      <span className="font-medium text-muted-foreground">
                        {key}:
                      </span>
                      <span className="truncate">
                        {typeof value === "object"
                          ? JSON.stringify(value)
                          : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

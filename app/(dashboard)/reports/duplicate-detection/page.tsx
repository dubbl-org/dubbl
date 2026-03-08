"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface DuplicateItem {
  id: string;
  number: string;
  date: string;
  status: string;
}

interface DuplicateGroup {
  type: "invoice" | "bill";
  contactName: string;
  amount: number;
  items: DuplicateItem[];
}

export default function DuplicateDetectionPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/reports/duplicate-detection", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => setGroups(data.duplicateGroups || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Duplicate Detection"
        description="Potential duplicate invoices and bills (same contact, same amount, within 7 days)."
      />

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg bg-muted/50 animate-pulse" />)}</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <div className="flex justify-center mb-3">
            <div className="size-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <AlertTriangle className="size-5 text-emerald-600" />
            </div>
          </div>
          <p className="text-sm font-medium">No duplicates detected</p>
          <p className="text-xs text-muted-foreground mt-1">All invoices and bills look clean.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" />
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {groups.length} potential duplicate group{groups.length !== 1 ? "s" : ""} found
              </p>
            </div>
          </div>

          {groups.map((group, gi) => (
            <div key={gi} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={group.type === "invoice" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-blue-200 bg-blue-50 text-blue-700"}>
                    {group.type}
                  </Badge>
                  <span className="text-sm font-medium">{group.contactName}</span>
                </div>
                <span className="font-mono text-sm font-semibold tabular-nums">{formatMoney(group.amount)}</span>
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => router.push(group.type === "invoice" ? `/sales/${item.id}` : `/purchases/${item.id}`)}
                    className="flex items-center justify-between w-full rounded px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">{item.number}</span>
                      <span>{item.date}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{item.status}</Badge>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

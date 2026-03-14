"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";

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
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch("/api/v1/reports/duplicate-detection", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setGroups(data.duplicateGroups || []);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="Duplicate Detection"
        description="Potential duplicate invoices and bills (same contact, same amount, within 7 days)."
      />

      {loading ? (
        <BrandLoader className="h-48" />
      ) : groups.length === 0 ? (
        <ContentReveal>
          <div className="rounded-xl border border-dashed py-12 text-center">
            <div className="flex justify-center mb-3">
              <div className="size-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                <AlertTriangle className="size-5 text-emerald-600" />
              </div>
            </div>
            <p className="text-sm font-medium">No duplicates detected</p>
            <p className="text-xs text-muted-foreground mt-1">All invoices and bills look clean.</p>
          </div>
        </ContentReveal>
      ) : (
        <ContentReveal>
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
        </ContentReveal>
      )}
    </ContentReveal>
  );
}

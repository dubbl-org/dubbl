"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft, DollarSign } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { formatMoney } from "@/lib/money";
import { ExportButton } from "@/components/dashboard/export-button";

interface BillRow {
  id: string;
  billNumber: string;
  contactName: string;
  dueDate: string;
  amountDue: number;
  daysOverdue: number;
}

interface AgingBucket {
  label: string;
  total: number;
  count: number;
  bills: BillRow[];
}

const columns: Column<BillRow>[] = [
  { key: "number", header: "Bill", className: "w-32", render: (r) => <span className="font-mono text-sm">{r.billNumber}</span> },
  { key: "contact", header: "Supplier", render: (r) => <span className="text-sm font-medium">{r.contactName}</span> },
  { key: "due", header: "Due Date", className: "w-28", render: (r) => <span className="text-sm">{r.dueDate}</span> },
  { key: "days", header: "Days Overdue", className: "w-28", render: (r) => <span className="text-sm tabular-nums">{r.daysOverdue}</span> },
  { key: "amount", header: "Amount Due", className: "w-32 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{formatMoney(r.amountDue)}</span> },
];

export default function AgedPayablesPage() {
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState<AgingBucket[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch("/api/v1/reports/aged-payables", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setBuckets(data.buckets || []);
        setGrandTotal(data.grandTotal || 0);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const allBills = buckets.flatMap((b) =>
    b.bills.map((bill) => ({ ...bill, bucket: b.label }))
  );

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="Aged Payables"
        description="Outstanding bills grouped by aging buckets."
      >
        <ExportButton
          data={allBills}
          columns={["billNumber", "contactName", "dueDate", "daysOverdue", "amountDue", "bucket"]}
          filename="aged-payables"
        />
      </PageHeader>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {buckets.map((b) => (
              <StatCard
                key={b.label}
                title={b.label}
                value={formatMoney(b.total)}
                change={`${b.count} bills`}
                icon={DollarSign}
              />
            ))}
          </div>

          <div className="rounded-lg border bg-card p-3 sm:p-4 mt-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">Total Outstanding</p>
            <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums truncate">{formatMoney(grandTotal)}</p>
          </div>

          <div className="mt-4">
            <DataTable
              columns={columns}
              data={allBills}
              loading={loading}
              emptyMessage="No outstanding payables."
            />
          </div>
        </div>
      )}
    </ContentReveal>
  );
}

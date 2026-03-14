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

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  contactName: string;
  dueDate: string;
  amountDue: number;
  daysOverdue: number;
}

interface AgingBucket {
  label: string;
  total: number;
  count: number;
  invoices: InvoiceRow[];
}

const columns: Column<InvoiceRow>[] = [
  { key: "number", header: "Invoice", className: "w-32", render: (r) => <span className="font-mono text-sm">{r.invoiceNumber}</span> },
  { key: "contact", header: "Customer", render: (r) => <span className="text-sm font-medium">{r.contactName}</span> },
  { key: "due", header: "Due Date", className: "w-28", render: (r) => <span className="text-sm">{r.dueDate}</span> },
  { key: "days", header: "Days Overdue", className: "w-28", render: (r) => <span className="text-sm tabular-nums">{r.daysOverdue}</span> },
  { key: "amount", header: "Amount Due", className: "w-32 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{formatMoney(r.amountDue)}</span> },
];

export default function AgedReceivablesPage() {
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
    fetch("/api/v1/reports/aged-receivables", {
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

  const allInvoices = buckets.flatMap((b) =>
    b.invoices.map((inv) => ({ ...inv, bucket: b.label }))
  );

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="Aged Receivables"
        description="Outstanding invoices grouped by aging buckets."
      >
        <ExportButton
          data={allInvoices}
          columns={["invoiceNumber", "contactName", "dueDate", "daysOverdue", "amountDue", "bucket"]}
          filename="aged-receivables"
        />
      </PageHeader>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <ContentReveal>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {buckets.map((b) => (
              <StatCard
                key={b.label}
                title={b.label}
                value={formatMoney(b.total)}
                change={`${b.count} invoices`}
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
              data={allInvoices}
              loading={loading}
              emptyMessage="No outstanding receivables."
            />
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}

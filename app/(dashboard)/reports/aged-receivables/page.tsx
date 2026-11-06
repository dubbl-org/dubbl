"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, DollarSign } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { DatePicker } from "@/components/ui/date-picker";
import { formatMoney } from "@/lib/money";
import { ExportButton } from "@/components/dashboard/export-button";
import { useApi } from "@/lib/query/use-api";

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
  const today = new Date().toISOString().slice(0, 10);
  const [asAt, setAsAt] = useState(today);
  const { data, loading } = useApi<{ buckets?: AgingBucket[]; grandTotal?: number }>(
    `/api/v1/reports/aged-receivables?${new URLSearchParams({ asAt })}`,
    { keepPrevious: true }
  );
  const buckets = data?.buckets || [];
  const grandTotal = data?.grandTotal || 0;

  const allInvoices = buckets.flatMap((b) =>
    b.invoices.map((inv) => ({ ...inv, bucket: b.label }))
  );

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="Who owes you (and how late)"
        description="Unpaid customer invoices, grouped by how overdue they are."
      >
        <ExportButton
          data={allInvoices}
          columns={["invoiceNumber", "contactName", "dueDate", "daysOverdue", "amountDue", "bucket"]}
          moneyColumns={["amountDue"]}
          filename="aged-receivables"
        />
      </PageHeader>

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted-foreground">As of date:</span>
          <DatePicker value={asAt} onChange={setAsAt} className="w-40 h-8 text-sm" />
        </div>
      </div>

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
          <p className="text-sm font-medium text-muted-foreground mb-1">Total owed to you</p>
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
    </ContentReveal>
  );
}

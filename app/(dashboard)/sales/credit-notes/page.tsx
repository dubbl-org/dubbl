"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, CreditCard, ReceiptText } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";

interface CreditNote {
  id: string;
  creditNoteNumber: string;
  issueDate: string;
  status: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountApplied: number;
  amountRemaining: number;
  contact: { name: string } | null;
  invoiceId: string | null;
}

const statusColors: Record<string, string> = {
  draft: "",
  sent: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  applied:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

const columns: Column<CreditNote>[] = [
  {
    key: "number",
    header: "Number",
    className: "w-32",
    render: (r) => (
      <span className="font-mono text-sm">{r.creditNoteNumber}</span>
    ),
  },
  {
    key: "contact",
    header: "Customer",
    render: (r) => (
      <span className="text-sm font-medium">{r.contact?.name || "-"}</span>
    ),
  },
  {
    key: "date",
    header: "Date",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.issueDate}</span>,
  },
  {
    key: "status",
    header: "Status",
    className: "w-24",
    render: (r) => (
      <Badge variant="outline" className={statusColors[r.status] || ""}>
        {r.status}
      </Badge>
    ),
  },
  {
    key: "total",
    header: "Total",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {formatMoney(r.total)}
      </span>
    ),
  },
  {
    key: "remaining",
    header: "Remaining",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {formatMoney(r.amountRemaining)}
      </span>
    ),
  },
];

export default function CreditNotesPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);

    fetch(`/api/v1/credit-notes?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setCreditNotes(data.data);
      })
      .then(() => devDelay())
      .finally(() => setLoading(false));
  }, [statusFilter]);

  if (loading) return <BrandLoader />;

  if (!loading && creditNotes.length === 0 && statusFilter === "all") {
    return (
      <ContentReveal>
        <div className="pt-12 pb-12 space-y-10">
          {/* Top: title + CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Credit Notes</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Issue credit notes to adjust invoices, handle refunds, or correct billing errors.
              </p>
            </div>
            <Button
              onClick={() => openDrawer("creditNote")}
              className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            >
              <Plus className="mr-2 size-4" />
              New Credit Note
            </Button>
          </div>

          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
            {/* Left: Ledger-style calculation */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How credit notes work</p>
              </div>
              <div className="divide-y">
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                      <ReceiptText className="size-3.5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Invoice total</p>
                      <p className="text-[11px] text-muted-foreground">INV-0042</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium">$1,200.00</span>
                </div>
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 bg-teal-50/30 dark:bg-teal-950/10">
                  <div className="flex items-center gap-3">
                    <div className="flex size-7 items-center justify-center rounded-md bg-teal-50 dark:bg-teal-950/40">
                      <CreditCard className="size-3.5 text-teal-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-teal-700 dark:text-teal-300">Credit applied</p>
                      <p className="text-[11px] text-muted-foreground">CN-0001</p>
                    </div>
                  </div>
                  <span className="font-mono text-sm font-medium text-teal-600 dark:text-teal-400">-$200.00</span>
                </div>
                <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="size-7" />
                    <p className="text-sm font-semibold">New balance</p>
                  </div>
                  <span className="font-mono text-sm font-bold">$1,000.00</span>
                </div>
              </div>
            </div>

            {/* Right: Use cases */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">When to use</p>
              {[
                {
                  title: "Overcharged a customer",
                  desc: "Billed too much on an invoice? Issue a credit to correct the amount.",
                  color: "border-l-blue-400",
                },
                {
                  title: "Product returned",
                  desc: "Customer returned goods? Credit the original invoice and adjust the balance.",
                  color: "border-l-amber-400",
                },
                {
                  title: "Service not delivered",
                  desc: "Cancelled or incomplete work? Issue a partial or full credit note.",
                  color: "border-l-teal-400",
                },
                {
                  title: "Goodwill discount",
                  desc: "Offering a retroactive discount? Apply it as a credit against the invoice.",
                  color: "border-l-purple-400",
                },
              ].map(({ title, desc, color }) => (
                <div key={title} className={`rounded-lg border border-l-[3px] ${color} bg-card px-4 py-3`}>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-10">
      <Section
        title="Credit Notes"
        description="View, filter, and manage all your credit notes."
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList className="overflow-x-auto">
                <TabsTrigger value="all" className="whitespace-nowrap">All</TabsTrigger>
                <TabsTrigger value="draft" className="whitespace-nowrap">Draft</TabsTrigger>
                <TabsTrigger value="sent" className="whitespace-nowrap">Sent</TabsTrigger>
                <TabsTrigger value="applied" className="whitespace-nowrap">Applied</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              onClick={() => openDrawer("creditNote")}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Credit Note
            </Button>
          </div>

          <DataTable
            columns={columns}
            data={creditNotes}
            loading={loading}
            emptyMessage="No credit notes found."
            onRowClick={(r) => router.push(`/sales/credit-notes/${r.id}`)}
          />
        </div>
      </Section>
    </ContentReveal>
  );
}

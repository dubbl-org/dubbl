"use client";

import { useState, useEffect } from "react";
import { Banknote } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";

interface Payment {
  id: string;
  paymentNumber: string;
  date: string;
  amount: number;
  method: string;
  reference: string | null;
  contact: { name: string } | null;
  allocations: { documentType: string; documentId: string; amount: number }[];
}

const methodLabels: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  check: "Check",
  card: "Card",
  other: "Other",
};

const columns: Column<Payment>[] = [
  {
    key: "number",
    header: "Number",
    className: "w-32",
    render: (r) => <span className="font-mono text-sm">{r.paymentNumber}</span>,
  },
  {
    key: "contact",
    header: "Customer",
    render: (r) => <span className="text-sm font-medium">{r.contact?.name || "-"}</span>,
  },
  {
    key: "date",
    header: "Date",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.date}</span>,
  },
  {
    key: "method",
    header: "Method",
    className: "w-32",
    render: (r) => <span className="text-sm">{methodLabels[r.method] || r.method}</span>,
  },
  {
    key: "reference",
    header: "Reference",
    className: "w-32",
    render: (r) => <span className="text-sm">{r.reference || "-"}</span>,
  },
  {
    key: "amount",
    header: "Amount",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">{formatMoney(r.amount)}</span>
    ),
  },
  {
    key: "allocations",
    header: "Allocations",
    className: "w-28",
    render: (r) => {
      const count = r.allocations?.length || 0;
      return (
        <span className="text-sm text-muted-foreground">
          {count === 0 ? "-" : `${count} invoice${count !== 1 ? "s" : ""}`}
        </span>
      );
    },
  },
];

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/payments?type=received`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setPayments(data.data);
      })
      .then(() => devDelay())
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <BrandLoader />;

  if (!loading && payments.length === 0) {
    return (
      <BlurReveal className="space-y-10">
        <Section title="Payments" description="Track payments received against your invoices.">
          <EmptyState
            icon={Banknote}
            title="No payments recorded"
            description="Payments will appear here when you record them against invoices."
          />
        </Section>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal className="space-y-10">
      <Section title="Payments" description="Track payments received against your invoices.">
        <DataTable
          columns={columns}
          data={payments}
          loading={loading}
          emptyMessage="No payments found."
        />
      </Section>
    </BlurReveal>
  );
}

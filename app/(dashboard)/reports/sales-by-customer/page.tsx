"use client";

import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { SalesBreakdown, type BreakdownRow } from "../_sales-breakdown";

interface Customer {
  contactId: string | null;
  contactName: string;
  net: number;
  tax: number;
  gross: number;
  invoiceCount: number;
}

function pick(json: Record<string, unknown>): BreakdownRow[] {
  return ((json.customers as Customer[] | undefined) ?? []).map((c) => ({
    key: c.contactId ?? "none",
    name: c.contactName,
    href: c.contactId ? `/contacts/${c.contactId}` : null,
    net: c.net,
    tax: c.tax,
    gross: c.gross,
    count: c.invoiceCount,
  }));
}

export default function SalesByCustomerPage() {
  useDocumentTitle("Reports · Sales by customer");
  return (
    <SalesBreakdown
      endpoint="/api/v1/reports/sales-by-customer"
      title="Sales by customer"
      description="Who your money comes from, ranked by what you invoiced them."
      help="Every customer you invoiced in the period, biggest first, with their share of your sales. Handy for spotting if you rely too much on one customer."
      nameLabel="Customer"
      countLabel="Invoices"
      pick={pick}
    />
  );
}

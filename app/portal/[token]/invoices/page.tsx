"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { FileText, Download, ArrowLeft, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import Link from "next/link";

interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  total: number;
  amountDue: number;
  currencyCode: string;
  // Per-invoice token for the public online-payment flow (/pay/{token}).
  // Present only when an online payment link has been generated for this
  // invoice (i.e. when online payment is available). When absent, the
  // "Pay now" button is hidden and we degrade to PDF-only.
  paymentLinkToken?: string | null;
}

// Statuses for which the invoice can still be paid online. Mirrors the
// payable check in /api/pay/[token]/checkout (rejects paid/void/draft).
const PAYABLE_STATUSES = new Set(["sent", "partial", "overdue"]);

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  void: "bg-gray-100 text-gray-500",
};

export default function PortalInvoicesPage() {
  const { token } = useParams<{ token: string }>();
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portal/${token}/invoices`)
      .then((r) => r.json())
      .then((data) => { if (data.data) setInvoices(data.data); })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl flex items-center gap-3">
          <Link href={`/portal/${token}`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="size-4" />
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">Invoices</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {loading ? (
          <p className="text-sm text-gray-500">Loading invoices...</p>
        ) : invoices.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="size-8 text-gray-300 mx-auto" />
            <p className="mt-3 text-sm text-gray-500">No invoices found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-lg border bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{inv.invoiceNumber}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Issued {inv.issueDate} · Due {inv.dueDate}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={statusColors[inv.status]}>
                    {inv.status}
                  </Badge>
                  <span className="text-sm font-mono tabular-nums font-medium text-gray-900">
                    {formatMoney(inv.total, inv.currencyCode)}
                  </span>
                  <a
                    href={`/api/portal/${token}/invoices/${inv.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                      <Download className="size-3" />
                      PDF
                    </Button>
                  </a>
                  {PAYABLE_STATUSES.has(inv.status) && inv.paymentLinkToken && (
                    <a href={`/pay/${inv.paymentLinkToken}`}>
                      <Button size="sm" className="h-7 text-xs gap-1">
                        <CreditCard className="size-3" />
                        Pay now
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

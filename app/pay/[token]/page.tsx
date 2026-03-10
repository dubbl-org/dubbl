"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, CreditCard, FileText, Loader2, AlertCircle } from "lucide-react";

function fmtMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxAmount: number;
}

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  total: number;
  amountDue: number;
  currencyCode: string;
  lines: InvoiceLine[];
}

interface PaymentData {
  status: "pending" | "paid";
  invoice: InvoiceData | { invoiceNumber: string };
  organization?: { name: string };
  contact?: { name: string };
  error?: string;
}

function PaymentPageContent() {
  const { token } = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const urlStatus = searchParams.get("status");

  const [data, setData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    async function fetchInvoice() {
      try {
        const res = await fetch(`/api/pay/${token}`);
        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Failed to load invoice");
          return;
        }

        setData(json);
      } catch {
        setError("Failed to load invoice");
      } finally {
        setLoading(false);
      }
    }

    fetchInvoice();
  }, [token]);

  async function handlePay() {
    setPaying(true);
    try {
      const res = await fetch(`/api/pay/${token}/checkout`, { method: "POST" });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to create checkout session");
        setPaying(false);
        return;
      }

      if (json.checkoutUrl) {
        window.location.href = json.checkoutUrl;
      }
    } catch {
      setError("Failed to create checkout session");
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-xl border bg-white dark:bg-gray-900 p-6 shadow-lg text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-xl border bg-white dark:bg-gray-900 p-6 shadow-lg text-center">
          <AlertCircle className="h-10 w-10 mx-auto text-red-500" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Unable to load invoice
          </h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  // Success state from Stripe redirect
  if (urlStatus === "success") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-xl border bg-white dark:bg-gray-900 p-6 shadow-lg text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
            Payment Successful
          </h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Thank you for your payment. A confirmation will be sent to your email.
          </p>
        </div>
      </div>
    );
  }

  // Already paid state
  if (data?.status === "paid") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-xl border bg-white dark:bg-gray-900 p-6 shadow-lg text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
            Invoice Already Paid
          </h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Invoice {data.invoice.invoiceNumber} has already been paid.
          </p>
        </div>
      </div>
    );
  }

  const inv = data?.invoice as InvoiceData;
  const currency = inv?.currencyCode || "USD";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border bg-white dark:bg-gray-900 p-6 shadow-lg">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {data?.organization?.name}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Invoice {inv.invoiceNumber}
            </p>
          </div>
        </div>

        {/* Invoice details */}
        <div className="space-y-3 mb-6">
          {data?.contact?.name && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Bill to</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                {data.contact.name}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Issue date</span>
            <span className="text-gray-900 dark:text-gray-100">{inv.issueDate}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Due date</span>
            <span className="text-gray-900 dark:text-gray-100">{inv.dueDate}</span>
          </div>
        </div>

        {/* Line items */}
        <div className="border-t border-b dark:border-gray-800 py-4 mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 dark:text-gray-400">
                <th className="text-left font-medium pb-2">Description</th>
                <th className="text-right font-medium pb-2">Qty</th>
                <th className="text-right font-medium pb-2">Price</th>
                <th className="text-right font-medium pb-2">Amount</th>
              </tr>
            </thead>
            <tbody className="text-gray-900 dark:text-gray-100">
              {inv.lines.map((line, i) => (
                <tr key={i}>
                  <td className="py-1.5">{line.description}</td>
                  <td className="text-right py-1.5">
                    {(line.quantity / 100).toFixed(2)}
                  </td>
                  <td className="text-right py-1.5">
                    {fmtMoney(line.unitPrice, currency)}
                  </td>
                  <td className="text-right py-1.5">
                    {fmtMoney(line.amount + line.taxAmount, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div className="flex justify-between items-center mb-6">
          <span className="text-gray-500 dark:text-gray-400 font-medium">
            Amount due
          </span>
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {fmtMoney(inv.amountDue, currency)}
          </span>
        </div>

        {/* Pay button */}
        <button
          onClick={handlePay}
          disabled={paying}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 transition-colors"
        >
          {paying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirecting to payment...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4" />
              Pay Now
            </>
          )}
        </button>

        <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
          Secure payment powered by Stripe
        </p>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border bg-white dark:bg-gray-900 p-6 shadow-lg text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
            <p className="mt-4 text-gray-500 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      }
    >
      <PaymentPageContent />
    </Suspense>
  );
}

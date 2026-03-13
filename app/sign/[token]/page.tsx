import { db } from "@/lib/db";
import { invoiceSignature } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { SignatureCanvas } from "./signature-canvas";

function fmtMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const sig = await db.query.invoiceSignature.findFirst({
    where: eq(invoiceSignature.token, token),
    with: { invoice: { with: { contact: true } } },
  });

  if (!sig) return notFound();

  const isExpired = sig.expiresAt && new Date() > sig.expiresAt;
  const isSigned = sig.status === "signed";
  const isDeclined = sig.status === "declined";
  const inv = sig.invoice;
  const currency = inv.currencyCode || "USD";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border bg-white dark:bg-gray-900 p-8 shadow-lg">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Sign Invoice {inv.invoiceNumber}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Requested for {sig.signerName} ({sig.signerEmail})
          </p>
        </div>

        {/* Invoice summary */}
        <div className="space-y-3 mb-6 border-t border-b dark:border-gray-800 py-4">
          {inv.contact && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Contact</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">
                {inv.contact.name}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Invoice</span>
            <span className="text-gray-900 dark:text-gray-100">
              {inv.invoiceNumber}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Issue date</span>
            <span className="text-gray-900 dark:text-gray-100">
              {inv.issueDate}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Due date</span>
            <span className="text-gray-900 dark:text-gray-100">
              {inv.dueDate}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Total</span>
            <span className="text-gray-900 dark:text-gray-100 font-semibold">
              {fmtMoney(inv.total, currency)}
            </span>
          </div>
        </div>

        {/* Status-dependent content */}
        {isSigned ? (
          <div className="text-center py-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
              <svg
                className="h-6 w-6 text-green-600 dark:text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Already Signed
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              This invoice was signed on{" "}
              {sig.signedAt
                ? new Date(sig.signedAt).toLocaleDateString()
                : "a previous date"}
              .
            </p>
          </div>
        ) : isExpired ? (
          <div className="text-center py-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mb-3">
              <svg
                className="h-6 w-6 text-amber-600 dark:text-amber-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Link Expired
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              This signing link has expired. Please request a new one from the
              sender.
            </p>
          </div>
        ) : isDeclined ? (
          <div className="text-center py-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 mb-3">
              <svg
                className="h-6 w-6 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Signature Declined
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              This signature request was declined.
            </p>
          </div>
        ) : (
          <SignatureCanvas token={token} />
        )}
      </div>
    </div>
  );
}

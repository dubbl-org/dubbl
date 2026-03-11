"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Payment {
  invoiceNumber: string;
  invoiceId: string;
  amountPaid: number;
  total: number;
  paidAt: string | null;
  status: string;
  currencyCode: string;
}

function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export default function PortalPaymentsPage() {
  const { token } = useParams<{ token: string }>();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/portal/${token}/payments`)
      .then(r => r.json())
      .then(data => setPayments(data.data || []))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <div className="flex min-h-[400px] items-center justify-center"><p className="text-sm text-gray-500">Loading...</p></div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Payment History</h2>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead className="text-right">Invoice Total</TableHead>
              <TableHead className="text-right">Amount Paid</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-gray-500 py-8">
                  No payments found
                </TableCell>
              </TableRow>
            ) : (
              payments.map(p => (
                <TableRow key={p.invoiceId}>
                  <TableCell className="text-sm font-medium">{p.invoiceNumber}</TableCell>
                  <TableCell className="text-sm text-right">{formatMoney(p.total, p.currencyCode)}</TableCell>
                  <TableCell className="text-sm text-right font-medium">{formatMoney(p.amountPaid, p.currencyCode)}</TableCell>
                  <TableCell className="text-sm">{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "-"}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "paid" ? "default" : "secondary"} className="text-xs">
                      {p.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

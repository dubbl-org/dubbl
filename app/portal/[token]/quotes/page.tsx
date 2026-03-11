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
import { Button } from "@/components/ui/button";

interface Quote {
  id: string;
  quoteNumber: string;
  issueDate: string;
  expiryDate: string;
  total: number;
  status: string;
  currencyCode: string;
}

function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export default function PortalQuotesPage() {
  const { token } = useParams<{ token: string }>();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  const loadQuotes = () => {
    fetch(`/api/v1/portal/${token}/quotes`)
      .then(r => r.json())
      .then(data => setQuotes(data.data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadQuotes(); }, [token]);

  const handleAccept = async (id: string) => {
    await fetch(`/api/v1/portal/${token}/quotes/${id}/accept`, { method: "POST" });
    loadQuotes();
  };

  if (loading) {
    return <div className="flex min-h-[400px] items-center justify-center"><p className="text-sm text-gray-500">Loading...</p></div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Quotes</h2>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quote #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                  No quotes found
                </TableCell>
              </TableRow>
            ) : (
              quotes.map(q => (
                <TableRow key={q.id}>
                  <TableCell className="text-sm font-medium">{q.quoteNumber}</TableCell>
                  <TableCell className="text-sm">{q.issueDate}</TableCell>
                  <TableCell className="text-sm">{q.expiryDate}</TableCell>
                  <TableCell className="text-sm text-right">{formatMoney(q.total, q.currencyCode)}</TableCell>
                  <TableCell>
                    <Badge variant={q.status === "accepted" ? "default" : q.status === "declined" ? "destructive" : "secondary"} className="text-xs">
                      {q.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {q.status === "sent" && (
                      <Button size="sm" variant="outline" onClick={() => handleAccept(q.id)}>
                        Accept
                      </Button>
                    )}
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

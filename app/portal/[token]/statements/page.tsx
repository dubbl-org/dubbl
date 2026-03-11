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

interface StatementLine {
  date: string;
  description: string;
  amount: number;
  paid: number;
  balance: number;
  runningBalance: number;
  status: string;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function PortalStatementsPage() {
  const { token } = useParams<{ token: string }>();
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/portal/${token}/statements`)
      .then(r => r.json())
      .then(data => {
        setLines(data.lines || []);
        setTotalOutstanding(data.totalOutstanding || 0);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <div className="flex min-h-[400px] items-center justify-center"><p className="text-sm text-gray-500">Loading...</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Statement of Account</h2>
        <div className="text-right">
          <p className="text-sm text-gray-500">Total Outstanding</p>
          <p className="text-xl font-bold">{formatMoney(totalOutstanding)}</p>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              lines.map((line, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{line.date}</TableCell>
                  <TableCell className="text-sm">{line.description}</TableCell>
                  <TableCell className="text-sm text-right">{formatMoney(line.amount)}</TableCell>
                  <TableCell className="text-sm text-right">{formatMoney(line.paid)}</TableCell>
                  <TableCell className="text-sm text-right font-medium">{formatMoney(line.balance)}</TableCell>
                  <TableCell>
                    <Badge variant={line.status === "paid" ? "default" : "secondary"} className="text-xs">
                      {line.status}
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

"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { X, BarChart3, Loader2, Download, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";
import { DatePicker } from "@/components/ui/date-picker";
import { useContactContext, getOrgId } from "../layout";

export default function ContactStatementPage() {
  const { id } = useParams<{ id: string }>();
  const { contact } = useContactContext();

  const [statementData, setStatementData] = useState<{
    contact: { id: string; name: string; email: string | null; type: string };
    startDate: string;
    endDate: string;
    openingBalance: number;
    transactions: { date: string; type: string; documentNumber: string; description: string; debit: number; credit: number; balance: number }[];
    closingBalance: number;
  } | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementStartDate, setStatementStartDate] = useState("");
  const [statementEndDate, setStatementEndDate] = useState("");
  const [sendingStatement, setSendingStatement] = useState(false);

  const statementTypeLabels: Record<string, string> = {
    invoice: "Invoice",
    credit_note: "Credit Note",
    payment: "Payment",
    bill: "Bill",
    debit_note: "Debit Note",
  };

  const fetchStatement = useCallback(async () => {
    const orgId = getOrgId();
    if (!orgId) return;

    setStatementLoading(true);
    try {
      const params = new URLSearchParams();
      if (statementStartDate) params.set("startDate", statementStartDate);
      if (statementEndDate) params.set("endDate", statementEndDate);

      const res = await fetch(`/api/v1/contacts/${id}/statement?${params}`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.contact) {
        setStatementData(data);
      }
    } catch {
      toast.error("Failed to load statement");
    } finally {
      setStatementLoading(false);
    }
  }, [id, statementStartDate, statementEndDate]);

  useEffect(() => {
    fetchStatement();
  }, [fetchStatement]);

  function applyStatementPreset(preset: string) {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (preset) {
      case "this_month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "last_month":
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case "this_quarter": {
        const q = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), q, 1);
        break;
      }
      case "last_quarter": {
        const q = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), q - 3, 1);
        end = new Date(now.getFullYear(), q, 0);
        break;
      }
      case "ytd":
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case "last_12":
        start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default:
        return;
    }
    setStatementStartDate(start.toISOString().slice(0, 10));
    setStatementEndDate(end.toISOString().slice(0, 10));
  }

  function handleDownloadPdf() {
    const orgId = getOrgId();
    if (!orgId) return;
    const params = new URLSearchParams({ orgId });
    if (statementStartDate) params.set("startDate", statementStartDate);
    if (statementEndDate) params.set("endDate", statementEndDate);
    window.open(`/api/v1/contacts/${id}/statement/pdf?${params}`, "_blank");
  }

  async function handleEmailStatement() {
    const orgId = getOrgId();
    if (!orgId) return;

    setSendingStatement(true);
    try {
      const res = await fetch(`/api/v1/contacts/${id}/statement/email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          startDate: statementStartDate || undefined,
          endDate: statementEndDate || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send");
      }
      toast.success("Statement emailed successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to email statement");
    } finally {
      setSendingStatement(false);
    }
  }

  return (
    <ContentReveal key="statement">
      <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Select onValueChange={applyStatementPreset}>
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="this_quarter">This Quarter</SelectItem>
              <SelectItem value="last_quarter">Last Quarter</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
              <SelectItem value="last_12">Last 12 Months</SelectItem>
            </SelectContent>
          </Select>
          <DatePicker
            value={statementStartDate}
            onChange={setStatementStartDate}
            placeholder="From date"
            className="w-36 h-8 text-sm"
          />
          <DatePicker
            value={statementEndDate}
            onChange={setStatementEndDate}
            placeholder="To date"
            className="w-36 h-8 text-sm"
          />
          {(statementStartDate || statementEndDate) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => {
                setStatementStartDate("");
                setStatementEndDate("");
              }}
            >
              <X className="mr-1 size-3" />
              Clear
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleDownloadPdf}
              disabled={statementLoading}
            >
              <Download className="mr-1.5 size-3.5" />
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleEmailStatement}
              disabled={statementLoading || sendingStatement || !contact.email}
              title={!contact.email ? "Contact has no email address" : undefined}
            >
              {sendingStatement ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 size-3.5" />
              )}
              Email
            </Button>
          </div>
        </div>

        {statementLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="brand-loader" aria-label="Loading">
              <div className="brand-loader-circle brand-loader-circle-1" />
              <div className="brand-loader-circle brand-loader-circle-2" />
            </div>
          </div>
        )}

        {!statementLoading && statementData && (
          <ContentReveal key={`statement-${statementStartDate}-${statementEndDate}`}>
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Opening Balance</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums font-mono">
                    {formatMoney(statementData.openingBalance)}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Debited</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums font-mono">
                    {formatMoney(statementData.transactions.reduce((s, t) => s + t.debit, 0))}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Credited</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums font-mono">
                    {formatMoney(statementData.transactions.reduce((s, t) => s + t.credit, 0))}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Closing Balance</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums font-mono">
                    {formatMoney(statementData.closingBalance)}
                  </p>
                </div>
              </div>

              {/* Transaction table */}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Reference</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium">Debit</th>
                      <th className="px-3 py-2 text-right font-medium">Credit</th>
                      <th className="px-3 py-2 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Opening balance row */}
                    <tr className="border-b bg-muted/30">
                      <td colSpan={6} className="px-3 py-2 text-sm font-medium">
                        Opening Balance
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm font-medium tabular-nums">
                        {formatMoney(statementData.openingBalance)}
                      </td>
                    </tr>

                    {statementData.transactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                          No transactions in this period
                        </td>
                      </tr>
                    ) : (
                      statementData.transactions.map((tx, i) => (
                        <tr key={i} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {new Date(tx.date + "T00:00:00").toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {statementTypeLabels[tx.type] || tx.type}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{tx.documentNumber}</td>
                          <td className="px-3 py-2 text-muted-foreground">{tx.description}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {tx.debit ? formatMoney(tx.debit) : "-"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {tx.credit ? formatMoney(tx.credit) : "-"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatMoney(tx.balance)}
                          </td>
                        </tr>
                      ))
                    )}

                    {/* Closing balance row */}
                    <tr className="bg-muted/30">
                      <td colSpan={6} className="px-3 py-2 text-sm font-medium">
                        Closing Balance
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm font-medium tabular-nums">
                        {formatMoney(statementData.closingBalance)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </ContentReveal>
        )}

        {!statementLoading && !statementData && (
          <ContentReveal key="statement-empty">
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-dashed">
              <BarChart3 className="mb-2 size-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No statement data</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Select a date range to generate a statement
              </p>
            </div>
          </ContentReveal>
        )}
      </div>
    </ContentReveal>
  );
}

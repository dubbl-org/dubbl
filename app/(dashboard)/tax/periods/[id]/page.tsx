"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccountPicker } from "@/components/dashboard/account-picker";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";

interface TaxReturnLine {
  id: string;
  boxNumber: string;
  label: string;
  amount: number; // cents
  isCalculated: boolean;
  sourceDescription: string | null;
  sortOrder: number;
}

interface TaxPeriodDetail {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  type: string;
  status: string;
  filedAt: string | null;
  filedReference: string | null;
  notes: string | null;
  lines: TaxReturnLine[];
}

const STATUS_STYLES: Record<string, string> = {
  open: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  filed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  amended:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  filed: "Submitted",
  amended: "Amended",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/*  Settlement Sheet                                                   */
/* ------------------------------------------------------------------ */

function SettleSheet({
  period,
  open,
  onClose,
  onSettled,
  orgId,
  defaultIsRefund,
  netAmount,
}: {
  period: TaxPeriodDetail;
  open: boolean;
  onClose: () => void;
  onSettled: () => void;
  orgId: string | null;
  defaultIsRefund: boolean;
  netAmount: number | null;
}) {
  const [bankGlAccountId, setBankGlAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"pay" | "refund">(
    defaultIsRefund ? "refund" : "pay"
  );
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  // Pre-fill amount + direction from the filed net (box 5) when the sheet opens.
  useEffect(() => {
    if (!open) return;
    setDirection(defaultIsRefund ? "refund" : "pay");
    if (netAmount != null) {
      setAmount((Math.abs(netAmount) / 100).toFixed(2));
    }
  }, [open, defaultIsRefund, netAmount]);

  async function handleSettle(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    if (!bankGlAccountId) {
      toast.error("Choose which account the money moves through");
      return;
    }
    const cents = Math.round(parseFloat(amount || "0") * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/tax-periods/${period.id}/file`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          mode: "settle",
          bankGlAccountId,
          amount: cents,
          isRefund: direction === "refund",
          date,
          reference: reference || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed");
      }
      toast.success(
        direction === "refund"
          ? "Refund recorded"
          : "Payment to the tax office recorded"
      );
      onClose();
      onSettled();
    } catch (err) {
      toast.error(
        err instanceof Error && err.message !== "Failed"
          ? err.message
          : "Couldn't record the settlement"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Record settlement</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSettle} className="space-y-4 px-4">
          <p className="text-sm text-muted-foreground">
            Record the money you paid to the tax office, or the refund you
            received from them, for &quot;{period.name}&quot;.
          </p>

          <div className="space-y-2">
            <Label>What happened</Label>
            <Select
              value={direction}
              onValueChange={(v) => setDirection(v as "pay" | "refund")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pay">I paid the tax office</SelectItem>
                <SelectItem value="refund">
                  I received a refund from the tax office
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              {direction === "refund"
                ? "Account the refund went into"
                : "Account the payment came from"}
            </Label>
            <AccountPicker
              value={bankGlAccountId}
              onChange={setBankGlAccountId}
              typeFilter={["asset"]}
              placeholder="Select bank or cash account..."
            />
          </div>

          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Reference (optional)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. payment confirmation"
            />
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            {saving
              ? "Saving..."
              : direction === "refund"
                ? "Record refund"
                : "Record payment"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function TaxPeriodDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [period, setPeriod] = useState<TaxPeriodDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [settleOpen, setSettleOpen] = useState(false);

  const orgId =
    typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEntityTitle(period?.name);

  const fetchPeriod = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/tax-periods/${id}`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.taxPeriod) setPeriod(data.taxPeriod);
    } finally {
      setLoading(false);
    }
  }, [id, orgId]);

  useEffect(() => {
    fetchPeriod();
  }, [fetchPeriod]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading..." />
        <BrandLoader className="h-48" />
      </div>
    );
  }

  if (!period) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tax period not found">
          <Button variant="outline" size="sm" asChild>
            <Link href="/tax/periods">
              <ArrowLeft className="mr-2 size-4" />
              Back
            </Link>
          </Button>
        </PageHeader>
      </div>
    );
  }

  const lines = [...(period.lines || [])].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
  const isFiled = period.status !== "open";

  // Box 5 is the filed net: positive = owed to the authority, negative = refund.
  const box5 = lines.find((l) => l.boxNumber === "5");
  const netAmount = box5 ? box5.amount : null;
  const defaultIsRefund = netAmount != null && netAmount < 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={period.name}
        description={`${fmtDate(period.startDate)} – ${fmtDate(period.endDate)}`}
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/tax/periods">
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Link>
        </Button>
      </PageHeader>

      {/* Status + meta */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge
          variant="outline"
          className={cn(STATUS_STYLES[period.status] || "")}
        >
          {STATUS_LABELS[period.status] || period.status}
        </Badge>
        <span className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground">
          <CalendarDays className="size-3.5" />
          {period.type.charAt(0).toUpperCase() + period.type.slice(1)}
        </span>
        {period.filedAt && (
          <span className="text-xs sm:text-sm text-muted-foreground">
            Submitted {fmtDate(period.filedAt)}
          </span>
        )}
        {period.filedReference && (
          <span className="text-xs sm:text-sm text-muted-foreground">
            Ref: {period.filedReference}
          </span>
        )}
      </div>

      {/* Settle action */}
      {isFiled && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
            <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Settle this return</p>
            <p className="text-xs text-muted-foreground">
              {netAmount == null
                ? "Record the payment to, or refund from, the tax office."
                : netAmount < 0
                  ? `You should receive ${formatMoney(Math.abs(netAmount), "USD")} back from the tax office.`
                  : netAmount > 0
                    ? `You owe ${formatMoney(netAmount, "USD")} to the tax office.`
                    : "Nothing to pay or reclaim for this return."}
            </p>
          </div>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => setSettleOpen(true)}
          >
            <Banknote className="mr-1.5 size-3.5" />
            Record payment / refund
          </Button>
        </div>
      )}

      {/* Filed boxes */}
      {lines.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Return boxes
          </p>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="w-16 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Box
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Description
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const isTotal =
                    line.boxNumber === "3" || line.boxNumber === "5";
                  return (
                    <tr
                      key={line.id}
                      className={cn(
                        "border-b last:border-b-0",
                        isTotal && "bg-muted/20 font-medium"
                      )}
                    >
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">
                        {line.boxNumber}
                      </td>
                      <td className="px-4 py-2.5">
                        {line.label}
                        {line.sourceDescription && (
                          <span className="ml-2 text-[11px] text-muted-foreground">
                            {line.sourceDescription}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {formatMoney(line.amount, "USD")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {netAmount != null && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              {netAmount < 0
                ? "Box 5 is negative — this is a refund due to you."
                : "Box 5 is the net amount payable to the tax office."}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
            <Receipt className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-medium">No filed boxes yet</h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {isFiled
              ? "This return was submitted but no box figures were frozen."
              : "Box figures are frozen when you submit this return. Submit it from the Tax Periods list to see the filed numbers here."}
          </p>
        </div>
      )}

      {/* Notes */}
      {period.notes && (
        <div className="rounded-lg border p-4">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Notes</p>
          <p className="text-sm">{period.notes}</p>
        </div>
      )}

      <SettleSheet
        period={period}
        open={settleOpen}
        onClose={() => setSettleOpen(false)}
        onSettled={fetchPeriod}
        orgId={orgId}
        defaultIsRefund={defaultIsRefund}
        netAmount={netAmount}
      />
    </div>
  );
}

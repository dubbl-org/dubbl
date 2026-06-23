"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccountPicker } from "./account-picker";

export interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  accountId: string;
  taxRateId: string;
}

// Mirrors the tax-rates API row shape ({ taxRates: [...] } from GET /api/v1/tax-rates).
// `rate` is in basis points (e.g. 2000 = 20%).
interface TaxRateOption {
  id: string;
  name: string;
  rate: number;
  kind?: string;
  recoverablePercent?: number;
}

interface LineItemsEditorProps {
  lines: LineItem[];
  onChange: (lines: LineItem[]) => void;
  accountTypeFilter?: string[];
  // Intent of the document, so we can surface purchase-side reclaim hints.
  taxContext?: "sales" | "purchase";
}

// Format a basis-point rate as a percentage (2000 -> "20", 1750 -> "17.5").
function formatRatePct(rate: number) {
  return (rate / 100).toFixed(rate % 100 === 0 ? 0 : 2);
}

// Whether a purchase-side rate's input VAT can be reclaimed. Rates that don't
// carry a recoverable portion (exempt/no-vat) or are explicitly partial are
// flagged so users understand what they'll actually get back.
function reclaimHint(rate: TaxRateOption): string | null {
  const kind = rate.kind || "standard";
  if (rate.rate <= 0 || kind === "exempt" || kind === "no_vat" || kind === "sales_tax_us") {
    return "not reclaimable";
  }
  const recoverable = rate.recoverablePercent ?? 10000;
  if (recoverable <= 0) return "not reclaimable";
  if (recoverable < 10000) return `${formatRatePct(recoverable)}% reclaimable`;
  return "reclaimable";
}

export function LineItemsEditor({ lines, onChange, accountTypeFilter, taxContext }: LineItemsEditorProps) {
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);

  // Fetch the org's tax rates once (org via x-organization-id, mirroring the
  // bank-flow tax dropdown). Best-effort: on failure only "No tax" is offered.
  useEffect(() => {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    if (!orgId) return;
    fetch("/api/v1/tax-rates", { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => { if (data.taxRates) setTaxRates(data.taxRates); })
      .catch(() => {});
  }, []);

  function updateLine(index: number, field: keyof LineItem, value: string) {
    const updated = lines.map((l, i) =>
      i === index ? { ...l, [field]: value } : l
    );
    onChange(updated);
  }

  function addLine() {
    onChange([
      ...lines,
      { description: "", quantity: "1", unitPrice: "", accountId: "", taxRateId: "" },
    ]);
  }

  function removeLine(index: number) {
    if (lines.length <= 1) return;
    onChange(lines.filter((_, i) => i !== index));
  }

  function lineAmount(line: LineItem) {
    const qty = parseFloat(line.quantity) || 0;
    const price = parseFloat(line.unitPrice) || 0;
    return qty * price;
  }

  // Tax-EXCLUSIVE: tax is computed on top of qty*price, matching how the
  // invoice/bill routes post (taxAmount = round(amount * rateBp / 10000)).
  function lineTax(line: LineItem) {
    if (!line.taxRateId) return 0;
    const rate = taxRates.find((t) => t.id === line.taxRateId);
    if (!rate || rate.rate <= 0) return 0;
    return Math.round((lineAmount(line) * 100 * rate.rate) / 10000) / 100;
  }

  const subtotal = lines.reduce((sum, l) => sum + lineAmount(l), 0);
  const taxTotal = lines.reduce((sum, l) => sum + lineTax(l), 0);
  const total = subtotal + taxTotal;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_80px_100px_120px_40px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Price</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        {lines.map((line, i) => {
          const selectedRate = line.taxRateId
            ? taxRates.find((t) => t.id === line.taxRateId)
            : undefined;
          const hint =
            taxContext === "purchase" && selectedRate ? reclaimHint(selectedRate) : null;
          return (
            <div
              key={i}
              className="grid grid-cols-[1fr_80px_100px_120px_40px] gap-2 border-b px-3 py-2 last:border-b-0"
            >
              <div className="space-y-1">
                <Input
                  className="h-8 text-sm"
                  value={line.description}
                  onChange={(e) => updateLine(i, "description", e.target.value)}
                  placeholder="Item description"
                />
                <AccountPicker
                  value={line.accountId}
                  onChange={(v) => updateLine(i, "accountId", v)}
                  typeFilter={accountTypeFilter}
                  placeholder="Account"
                />
                <Select
                  value={line.taxRateId || "none"}
                  onValueChange={(v) => updateLine(i, "taxRateId", v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="No tax" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No tax</SelectItem>
                    {taxRates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({formatRatePct(t.rate)}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hint && (
                  <p className="text-[11px] text-muted-foreground">{hint}</p>
                )}
              </div>
              <Input
                className="h-8 text-right text-sm font-mono tabular-nums"
                type="number"
                step="1"
                min="1"
                value={line.quantity}
                onChange={(e) => updateLine(i, "quantity", e.target.value)}
              />
              <CurrencyInput
                size="sm"
                value={line.unitPrice}
                onChange={(v) => updateLine(i, "unitPrice", v)}
              />
              <span className="flex h-8 items-center justify-end text-sm font-mono font-medium tabular-nums">
                {lineAmount(line).toFixed(2)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => removeLine(i)}
                disabled={lines.length <= 1}
              >
                <Trash2 className="size-3.5 text-muted-foreground" />
              </Button>
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addLine}
            className="text-xs"
          >
            <Plus className="mr-1 size-3" />
            Add line
          </Button>
          <div className="space-y-0.5 text-right text-sm font-mono tabular-nums">
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">Tax</span>
              <span>{taxTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-6 font-semibold">
              <span>Total</span>
              <span>{total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

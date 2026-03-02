"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountPicker } from "./account-picker";

export interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  accountId: string;
  taxRateId: string;
}

interface LineItemsEditorProps {
  lines: LineItem[];
  onChange: (lines: LineItem[]) => void;
  accountTypeFilter?: string[];
}

export function LineItemsEditor({ lines, onChange, accountTypeFilter }: LineItemsEditorProps) {
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

  const subtotal = lines.reduce((sum, l) => sum + lineAmount(l), 0);

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
        {lines.map((line, i) => (
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
            </div>
            <Input
              className="h-8 text-right text-sm font-mono tabular-nums"
              type="number"
              step="1"
              min="1"
              value={line.quantity}
              onChange={(e) => updateLine(i, "quantity", e.target.value)}
            />
            <Input
              className="h-8 text-right text-sm font-mono tabular-nums"
              type="number"
              step="0.01"
              min="0"
              value={line.unitPrice}
              onChange={(e) => updateLine(i, "unitPrice", e.target.value)}
              placeholder="0.00"
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
        ))}
        <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2">
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
          <span className="text-sm font-mono font-semibold tabular-nums">
            Subtotal: {subtotal.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApi } from "@/lib/query/use-api";

interface BankAccountOption {
  id: string;
  accountName: string;
  currencyCode: string;
  isActive: boolean;
}

// Radix Select can't hold an empty value, so "no choice" gets a sentinel.
const DEFAULT = "__default";

/**
 * Pick the bank account a bill payment leaves from. An empty value means the
 * default bank account (ledger account 1100), which is what the API uses when
 * no bankAccountId is sent. Renders nothing until the org has bank accounts.
 */
export function BankAccountSelect({
  value,
  onChange,
  label = "Paid from",
  hint = "The bank account the money leaves. The payment is posted to its ledger account.",
  className,
  labelClassName,
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  hint?: string | null;
  className?: string;
  labelClassName?: string;
}) {
  const { data } = useApi<{ bankAccounts?: BankAccountOption[] }>("/api/v1/bank-accounts");
  const accounts = (data?.bankAccounts ?? []).filter((a) => a.isActive || a.id === value);
  if (accounts.length === 0) return null;

  return (
    <div className={className ?? "space-y-2"}>
      <Label className={labelClassName}>{label}</Label>
      <Select value={value || DEFAULT} onValueChange={(v) => onChange(v === DEFAULT ? "" : v)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT}>Default bank account</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.accountName} · {a.currencyCode}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface AccountPickerProps {
  value: string;
  onChange: (accountId: string) => void;
  typeFilter?: string[];
  placeholder?: string;
}

export function AccountPicker({ value, onChange, typeFilter, placeholder = "Select account..." }: AccountPickerProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.accounts) {
          let accts = data.accounts;
          if (typeFilter) {
            accts = accts.filter((a: Account) => typeFilter.includes(a.type));
          }
          setAccounts(accts);
        }
      });
  }, [typeFilter]);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.code} — {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

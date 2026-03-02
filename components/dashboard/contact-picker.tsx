"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  type: string;
}

interface ContactPickerProps {
  value: string;
  onChange: (contactId: string) => void;
  type?: "customer" | "supplier";
  placeholder?: string;
}

export function ContactPicker({ value, onChange, type, placeholder = "Select contact..." }: ContactPickerProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const params = new URLSearchParams({ limit: "200" });
    if (type) params.set("type", type);

    fetch(`/api/v1/contacts?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setContacts(data.data);
      });
  }, [type]);

  const filtered = contacts.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <div className="px-2 pb-2">
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        {filtered.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
            {c.email && (
              <span className="ml-2 text-xs text-muted-foreground">{c.email}</span>
            )}
          </SelectItem>
        ))}
        {filtered.length === 0 && (
          <div className="py-2 text-center text-sm text-muted-foreground">
            No contacts found
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
